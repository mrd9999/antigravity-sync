/**
 * SidePanelProvider - WebviewViewProvider for the side panel
 */
import * as vscode from 'vscode';
import { SyncService } from '../services/SyncService';
import { ConfigService } from '../services/ConfigService';
import { NotificationService } from '../services/NotificationService';
import { GitService } from '../services/GitService';

export class SidePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'antigravitySync.mainPanel';

  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _syncService: SyncService;
  private readonly _configService: ConfigService;

  constructor(
    extensionUri: vscode.Uri,
    syncService: SyncService,
    configService: ConfigService
  ) {
    this._extensionUri = extensionUri;
    this._syncService = syncService;
    this._configService = configService;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'media')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'checkConfig':
          await this.sendConfigState();
          break;
        case 'saveConfig':
          await this.handleSaveConfig(message.repoUrl, message.pat);
          break;
        case 'syncNow':
          await this.handleSync();
          break;
        case 'push':
          await this.handlePush();
          break;
        case 'pull':
          await this.handlePull();
          break;
        case 'disconnect':
          await this.handleDisconnect();
          break;
        case 'toggleFolder':
          await this.handleFolderToggle(message.folder, message.enabled);
          break;
        case 'toggleSyncEnabled':
          await this.handleToggleSyncEnabled(message.enabled);
          break;
        case 'openExternal':
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case 'getGitStatus':
          // Just refresh status (git fetch + check) - no file copy needed
          await this.sendGitStatus();
          break;
      }
    });
  }

  /**
   * Send current config state to webview
   */
  private async sendConfigState(): Promise<void> {
    if (!this._view) return;

    const isConfigured = await this._configService.isConfigured();
    const config = this._configService.getConfig();
    const vsConfig = vscode.workspace.getConfiguration('antigravitySync');
    const syncFolders = vsConfig.get<string[]>('syncFolders', ['knowledge']);

    this._view.webview.postMessage({
      type: 'configured',
      data: {
        configured: isConfigured,
        repoUrl: config.repositoryUrl,
        syncFolders: syncFolders
      }
    });

    if (isConfigured) {
      await this.updateStatus();

      // Wire git logger to UI panel (for when extension is already configured)
      this._syncService.setGitLogger((msg, type) => this.sendLog(msg, type));

      // Start auto-sync timer if not already running
      this._syncService.setCountdownCallback((seconds) => {
        if (this._view) {
          this._view.webview.postMessage({
            type: 'countdown',
            data: { seconds }
          });
        }
      });
      this._syncService.startAutoSync();
    }
  }

  /**
   * Handle save config from webview inline form
   */
  private async handleSaveConfig(repoUrl: string, pat: string): Promise<void> {
    if (!this._view) return;

    if (!repoUrl || !pat) {
      this._view.webview.postMessage({
        type: 'configError',
        data: { message: 'Please fill in both fields' }
      });
      return;
    }

    try {
      this.sendLog('Connecting...', 'info');

      // Validate URL is a Git repository URL
      this.sendLog('Validating repository URL...', 'info');
      const validationResult = this.validateGitRepoUrl(repoUrl);
      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }

      if (pat.length < 5) {
        throw new Error('Access token appears too short');
      }

      // CRITICAL: Check if repo is PUBLIC (reject if accessible without auth)
      this.sendLog('Checking repository privacy...', 'info');
      const isPublic = await this.checkIsPublicRepo(repoUrl);
      if (isPublic) {
        throw new Error('Repository is PUBLIC! Your data may contain sensitive info. Please use a PRIVATE repository.');
      }

      // Verify token has access to the repository FIRST (before saving)
      this.sendLog('Verifying access token...', 'info');
      const tempGitService = new GitService(this._configService.getSyncRepoPath());
      await tempGitService.verifyAccess(repoUrl, pat);

      // Save URL first (credentials storage depends on URL)
      this.sendLog('Saving credentials to Git credential manager...', 'info');
      await this._configService.setRepositoryUrl(repoUrl);
      // Now save credentials (uses Git credential manager - persists across workspaces)
      await this._configService.saveCredentials(pat);

      // Initialize sync
      this.sendLog('Initializing Git repository...', 'info');
      await this._syncService.initialize();

      // Wire git logger to UI panel
      this._syncService.setGitLogger((msg, type) => this.sendLog(msg, type));

      this.sendLog('Connected successfully!', 'success');

      // Setup auto-sync timer with countdown callback
      this._syncService.setCountdownCallback((seconds) => {
        if (this._view) {
          this._view.webview.postMessage({
            type: 'countdown',
            data: { seconds }
          });
        }
      });
      this._syncService.startAutoSync();

      // Update webview and check git status
      await this.sendConfigState();
      await this.sendGitStatus();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Configuration failed';
      this.sendLog(`Connect failed: ${message}`, 'error');
      this._view.webview.postMessage({
        type: 'configError',
        data: { message }
      });
    }
  }

  /**
   * Validate Git repository URL format
   */
  private validateGitRepoUrl(url: string): { valid: boolean; error?: string } {
    // Must start with valid protocol
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('git@')) {
      return { valid: false, error: 'Invalid URL. Use https://... or git@...' };
    }

    // Known Git providers
    const gitProviders = [
      'github.com',
      'gitlab.com',
      'bitbucket.org',
      'gitee.com',
      'codeberg.org',
      'sr.ht',
      'dev.azure.com'
    ];

    // Check if URL contains a known provider OR has .git extension OR has typical repo path
    const urlLower = url.toLowerCase();
    const isKnownProvider = gitProviders.some(p => urlLower.includes(p));
    const hasGitExtension = urlLower.endsWith('.git');
    const hasRepoPath = /\/([\w.-]+)\/([\w.-]+)(\.git)?$/.test(url);

    if (!isKnownProvider && !hasGitExtension && !hasRepoPath) {
      return {
        valid: false,
        error: 'URL does not look like a Git repository. Expected format: https://host/user/repo or git@host:user/repo.git'
      };
    }

    return { valid: true };
  }

  /**
   * Check if repository is PUBLIC by trying to access it without auth
   * If accessible without auth = PUBLIC = reject
   */
  private async checkIsPublicRepo(url: string): Promise<boolean> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // Try git ls-remote without authentication
      // Disable credential helpers to ensure we test without stored creds
      await execAsync(`git ls-remote ${url}`, {
        timeout: 10000,
        env: {
          ...process.env,
          GIT_ASKPASS: 'echo',           // Disable GUI prompts
          GIT_TERMINAL_PROMPT: '0',      // Disable terminal prompts
          GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',  // Disable SSH prompts
          GIT_CONFIG_NOSYSTEM: '1',      // Ignore system git config
          HOME: '/nonexistent'           // Ignore user's credential helpers
        }
      });
      return true; // Accessible without auth = PUBLIC
    } catch {
      return false; // Not accessible = PRIVATE (or doesn't exist)
    }
  }

  /**
   * Handle sync action
   */
  private async handleSync(): Promise<void> {
    this.updateStatus('syncing');
    this.sendLog('Syncing...', 'info');
    try {
      await this._syncService.sync();
      this.updateStatus('synced');
      this.sendLog('Sync complete', 'success');
      await this.sendGitStatus();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus('error');
      this.sendLog(`Sync failed: ${errorMsg}`, 'error');
      NotificationService.handleSyncError(error as Error);
    }
  }

  /**
   * Handle push action
   */
  private async handlePush(): Promise<void> {
    this.updateStatus('syncing');
    this.sendLog('Pushing...', 'info');
    try {
      await this._syncService.push();
      this.updateStatus('synced');
      this.sendLog('Push complete', 'success');
      await this.sendGitStatus();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus('error');
      this.sendLog(`Push failed: ${errorMsg}`, 'error');
      NotificationService.handleSyncError(error as Error);
    }
  }

  /**
   * Handle pull action
   */
  private async handlePull(): Promise<void> {
    this.updateStatus('syncing');
    this.sendLog('Pulling...', 'info');
    try {
      await this._syncService.pull();
      this.updateStatus('synced');
      this.sendLog('Pull complete', 'success');
      await this.sendGitStatus();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus('error');
      this.sendLog(`Pull failed: ${errorMsg}`, 'error');
      NotificationService.handleSyncError(error as Error);
    }
  }

  /**
   * Handle disconnect
   */
  private async handleDisconnect(): Promise<void> {
    // Delete credentials and clear URL
    await this._configService.deleteCredentials();
    await vscode.workspace.getConfiguration('antigravitySync')
      .update('repositoryUrl', '', vscode.ConfigurationTarget.Global);

    // Delete .git folder to allow connecting to different repo
    const syncRepoPath = this._configService.getSyncRepoPath();
    const gitPath = require('path').join(syncRepoPath, '.git');
    if (require('fs').existsSync(gitPath)) {
      require('fs').rmSync(gitPath, { recursive: true, force: true });
    }

    await this.sendConfigState();
  }

  /**
   * Update status in webview
   */
  private async updateStatus(status?: 'synced' | 'syncing' | 'error' | 'pending'): Promise<void> {
    if (!this._view) return;

    let lastSync: string | undefined;
    if (!status) {
      // Get actual status from service
      try {
        const syncStatus = await this._syncService.getStatus();
        status = syncStatus.syncStatus === 'Ready' ? 'synced' : 'pending';
        lastSync = syncStatus.lastSync || undefined;
      } catch {
        status = 'synced';
      }
    }

    this._view.webview.postMessage({
      type: 'updateStatus',
      data: { status, lastSync }
    });
  }

  /**
   * Handle folder toggle from webview
   */
  private async handleFolderToggle(folder: string, enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('antigravitySync');
    const syncFolders = config.get<string[]>('syncFolders', ['knowledge', 'antigravity']);

    let newFolders: string[];
    if (enabled) {
      newFolders = [...new Set([...syncFolders, folder])];
    } else {
      newFolders = syncFolders.filter(f => f !== folder);
    }

    await config.update('syncFolders', newFolders, vscode.ConfigurationTarget.Global);
  }

  /**
   * Handle enable/disable sync toggle
   */
  private async handleToggleSyncEnabled(enabled: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('antigravitySync');
    await config.update('enabled', enabled, vscode.ConfigurationTarget.Global);

    // Notify user
    if (enabled) {
      NotificationService.info('Sync enabled');
    } else {
      NotificationService.info('Sync disabled');
    }
  }

  /**
   * Send log message to webview
   */
  private sendLog(message: string, logType: 'success' | 'error' | 'info'): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'log',
      data: { message, logType }
    });
  }

  /**
   * Send git status to webview
   */
  private async sendGitStatus(): Promise<void> {
    if (!this._view) return;

    try {
      const status = await this._syncService.getDetailedStatus();
      this._view.webview.postMessage({
        type: 'gitStatus',
        data: {
          ahead: status.ahead,
          behind: status.behind,
          files: status.files,
          totalFiles: status.totalFiles,
          syncRepoPath: this._configService.getSyncRepoPath()
        }
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Show error in webview
   */
  public showError(message: string): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'showError',
      data: { message }
    });
  }

  /**
   * Update panel data (for external calls)
   */
  public async updatePanelData(): Promise<void> {
    await this.sendConfigState();
  }

  /**
   * Generate HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'media', 'styles.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src https://microsoft.github.io; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Antigravity Sync</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
