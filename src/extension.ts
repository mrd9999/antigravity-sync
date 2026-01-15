/**
 * Antigravity Sync - VS Code Extension
 * Sync ~/.gemini/ folder across machines via private Git repository
 */
import * as vscode from 'vscode';
import { SyncService } from './services/SyncService';
import { ConfigService } from './services/ConfigService';
import { StatusBarService } from './services/StatusBarService';
import { WatcherService } from './services/WatcherService';
import { NotificationService } from './services/NotificationService';
import { SidePanelProvider } from './ui/SidePanelProvider';

let syncService: SyncService | undefined;
let watcherService: WatcherService | undefined;
let statusBarService: StatusBarService | undefined;
let sidePanelProvider: SidePanelProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Antigravity Sync is activating...');

  // Initialize services
  const configService = new ConfigService(context);
  statusBarService = new StatusBarService();
  syncService = new SyncService(context, configService, statusBarService);
  watcherService = new WatcherService(configService, syncService);

  // Register side panel
  sidePanelProvider = new SidePanelProvider(context.extensionUri, syncService, configService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidePanelProvider.viewType,
      sidePanelProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravitySync.configure', async () => {
      await configureRepository(context, configService, syncService!);
    }),

    vscode.commands.registerCommand('antigravitySync.syncNow', async () => {
      try {
        await syncService?.sync();
        sidePanelProvider?.updatePanelData();
      } catch (error) {
        NotificationService.handleSyncError(error as Error);
      }
    }),

    vscode.commands.registerCommand('antigravitySync.push', async () => {
      try {
        await syncService?.push();
        sidePanelProvider?.updatePanelData();
      } catch (error) {
        NotificationService.handleSyncError(error as Error);
      }
    }),

    vscode.commands.registerCommand('antigravitySync.pull', async () => {
      try {
        await syncService?.pull();
        sidePanelProvider?.updatePanelData();
      } catch (error) {
        NotificationService.handleSyncError(error as Error);
      }
    }),

    vscode.commands.registerCommand('antigravitySync.showStatus', async () => {
      await showStatus(syncService!);
    }),

    vscode.commands.registerCommand('antigravitySync.openPanel', () => {
      vscode.commands.executeCommand('antigravity-sync.focus');
    }),

    statusBarService.getStatusBarItem()
  );

  // Check if first time - show setup wizard
  if (!(await configService.isConfigured())) {
    showWelcomeMessage();
  } else {
    // Start watching if configured
    try {
      await syncService.initialize();
      watcherService.start();
      statusBarService.show();
    } catch (error) {
      NotificationService.handleSyncError(error as Error);
    }
  }

  console.log('Antigravity Sync activated!');
}

export function deactivate(): void {
  watcherService?.stop();
  statusBarService?.hide();
  console.log('Antigravity Sync deactivated');
}

/**
 * Show welcome message for first-time users
 */
function showWelcomeMessage(): void {
  vscode.window.showInformationMessage(
    'Welcome to Antigravity Sync! Set up your private repository to sync your Gemini context.',
    'Configure Now',
    'Later'
  ).then(selection => {
    if (selection === 'Configure Now') {
      vscode.commands.executeCommand('antigravitySync.configure');
    }
  });
}

/**
 * Configure repository with setup wizard
 */
async function configureRepository(
  context: vscode.ExtensionContext,
  configService: ConfigService,
  syncService: SyncService
): Promise<void> {
  // Step 1: Welcome and explanation
  const proceed = await vscode.window.showInformationMessage(
    'Antigravity Sync Setup\n\nThis will sync your ~/.gemini folder (Knowledge Items, settings) to a private Git repository.',
    { modal: true },
    'Continue'
  );

  if (proceed !== 'Continue') {
    return;
  }

  // Step 2: Get access token
  const token = await vscode.window.showInputBox({
    title: 'Step 1/3: Git Access Token',
    prompt: 'Enter your access token (PAT for GitHub/GitLab, App Password for Bitbucket)',
    password: true,
    placeHolder: 'Your access token with repo access',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || value.length < 8) {
        return 'Please enter a valid access token';
      }
      return undefined;
    }
  });

  if (!token) {
    return;
  }

  // Step 3: Get repository URL
  const repoUrl = await vscode.window.showInputBox({
    title: 'Step 2/3: Private Repository URL',
    prompt: 'Enter your PRIVATE repository URL (GitHub, GitLab, Bitbucket, etc.)',
    placeHolder: 'https://github.com/user/repo or https://gitlab.com/user/repo',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.includes('://')) {
        return 'Please enter a valid Git repository URL';
      }
      return undefined;
    }
  });

  if (!repoUrl) {
    return;
  }

  // Step 4: Validate and save
  try {
    await NotificationService.withProgress(
      'Validating repository...',
      async (progress) => {
        progress.report({ message: 'Checking repository...' });

        // URL must be set first (credentials storage depends on URL)
        await configService.setRepositoryUrl(repoUrl);
        await configService.saveCredentials(token);

        progress.report({ message: 'Initializing sync...' });
        await syncService.initialize();
      }
    );

    vscode.window.showInformationMessage(
      'Antigravity Sync configured successfully! 🎉\n\nYour context will now sync automatically.',
      'Open Panel'
    ).then(selection => {
      if (selection === 'Open Panel') {
        vscode.commands.executeCommand('antigravity-sync.focus');
      }
    });

    // Start watching
    watcherService?.start();
    statusBarService?.show();
    sidePanelProvider?.updatePanelData();
  } catch (error) {
    await configService.deleteCredentials();
    NotificationService.handleSyncError(error as Error);
  }
}

/**
 * Show sync status quick pick
 */
async function showStatus(syncService: SyncService): Promise<void> {
  const status = await syncService.getStatus();

  const items: vscode.QuickPickItem[] = [
    { label: '$(sync) Sync Status', description: status.syncStatus },
    { label: '$(git-commit) Last Sync', description: status.lastSync || 'Never' },
    { label: '$(file) Pending Changes', description: String(status.pendingChanges) },
    { label: '$(repo) Repository', description: status.repository || 'Not configured' }
  ];

  await vscode.window.showQuickPick(items, {
    title: 'Antigravity Sync Status',
    placeHolder: 'Current sync status'
  });
}
