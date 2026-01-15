/**
 * ConfigService - Manages extension configuration and credentials
 */
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface SyncConfig {
  repositoryUrl: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  excludePatterns: string[];
  geminiPath: string;
}

export class ConfigService {
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get the full configuration
   */
  getConfig(): SyncConfig {
    const config = vscode.workspace.getConfiguration('antigravitySync');
    return {
      repositoryUrl: config.get<string>('repositoryUrl', ''),
      autoSync: config.get<boolean>('autoSync', true),
      syncIntervalMinutes: config.get<number>('syncIntervalMinutes', 5),
      excludePatterns: config.get<string[]>('excludePatterns', []),
      geminiPath: config.get<string>('geminiPath', '') || this.getDefaultGeminiPath()
    };
  }

  /**
   * Check if extension is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.repositoryUrl) {
      return false;
    }
    const pat = await this.getCredentials();
    return !!pat;
  }

  /**
   * Get default .gemini/antigravity path (the actual context folder)
   */
  getDefaultGeminiPath(): string {
    return path.join(os.homedir(), '.gemini', 'antigravity');
  }

  /**
   * Get the sync repository local path
   */
  getSyncRepoPath(): string {
    return path.join(os.homedir(), '.gemini-sync-repo');
  }

  /**
   * Save Git access token using Git credential manager
   * This stores credentials in the system's secure credential store
   */
  async saveCredentials(token: string): Promise<void> {
    const config = this.getConfig();
    if (!config.repositoryUrl) {
      throw new Error('Repository URL must be set before saving credentials');
    }
    await this.storeGitCredentials(config.repositoryUrl, token);
  }

  /**
   * Get Git access token from Git credential manager
   */
  async getCredentials(): Promise<string | undefined> {
    const config = this.getConfig();
    if (!config.repositoryUrl) {
      return undefined;
    }
    return await this.getGitCredentials(config.repositoryUrl);
  }

  /**
   * Delete credentials from Git credential manager
   */
  async deleteCredentials(): Promise<void> {
    const config = this.getConfig();
    if (config.repositoryUrl) {
      await this.deleteGitCredentials(config.repositoryUrl);
    }
  }

  /**
   * Store credentials in Git credential manager (per-repository)
   */
  private async storeGitCredentials(url: string, token: string): Promise<void> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      throw new Error('Invalid Git URL');
    }

    // Configure credential helper first
    await this.configureCredentialHelper();

    const isGitLab = url.includes('gitlab');
    const username = isGitLab ? 'oauth2' : 'token';

    // Include path for per-repository credential storage
    const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\npath=${parsed.path}\nusername=${username}\npassword=${token}\n`;

    try {
      await new Promise<void>((resolve, reject) => {
        const child = exec('git credential approve', (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        child.stdin?.write(credentialInput);
        child.stdin?.end();
      });
    } catch {
      // Fallback: write to .git-credentials file directly (with full path for per-repo)
      const credentialStorePath = path.join(os.homedir(), '.git-credentials');
      // Store with full path: https://token:TOKEN@github.com/owner/repo.git
      const credentialLine = `${parsed.protocol}://${username}:${token}@${parsed.host}${parsed.path}\n`;

      let existingContent = '';
      if (fs.existsSync(credentialStorePath)) {
        existingContent = fs.readFileSync(credentialStorePath, 'utf8');
        // Remove existing credential for this exact repo (not just host)
        const repoIdentifier = `@${parsed.host}${parsed.path}`;
        const lines = existingContent.split('\n').filter(line => !line.includes(repoIdentifier));
        existingContent = lines.join('\n');
        if (existingContent && !existingContent.endsWith('\n')) {
          existingContent += '\n';
        }
      }

      fs.writeFileSync(credentialStorePath, existingContent + credentialLine, { mode: 0o600 });
    }
  }

  /**
   * Retrieve credentials from Git credential manager (per-repository)
   */
  private async getGitCredentials(url: string): Promise<string | undefined> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      return undefined;
    }

    // Method 1: Try using git credential fill with execSync (with path for per-repo)
    try {
      const { execSync } = require('child_process');
      const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\npath=${parsed.path}\n`;
      const result = execSync('git credential fill', {
        input: credentialInput,
        encoding: 'utf8',
        timeout: 5000
      });

      const passwordMatch = result.match(/password=(.+)/);
      if (passwordMatch) {
        return passwordMatch[1].trim();
      }
    } catch {
      // git credential fill failed, try fallback
    }

    // Method 2: Read directly from .git-credentials file
    const credentialStorePath = path.join(os.homedir(), '.git-credentials');
    if (fs.existsSync(credentialStorePath)) {
      const content = fs.readFileSync(credentialStorePath, 'utf8');
      const repoIdentifier = `@${parsed.host}${parsed.path}`;

      // First, try to find exact repo match (per-repository credential)
      for (const line of content.split('\n')) {
        if (line.includes(repoIdentifier)) {
          const urlMatch = line.match(/\/\/([^:]+):([^@]+)@/);
          if (urlMatch) {
            return urlMatch[2];
          }
        }
      }

      // Fallback: try host-only match (for backwards compatibility)
      for (const line of content.split('\n')) {
        if (line.includes(`@${parsed.host}`) && !line.includes(`@${parsed.host}/`)) {
          const urlMatch = line.match(/\/\/([^:]+):([^@]+)@/);
          if (urlMatch) {
            return urlMatch[2];
          }
        }
      }

      // Last resort: any credential for this host
      for (const line of content.split('\n')) {
        if (line.includes(`@${parsed.host}`)) {
          const urlMatch = line.match(/\/\/([^:]+):([^@]+)@/);
          if (urlMatch) {
            return urlMatch[2];
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Delete credentials from Git credential manager (per-repository)
   */
  private async deleteGitCredentials(url: string): Promise<void> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      return;
    }

    // Include path for per-repository credential deletion
    const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\npath=${parsed.path}\n`;

    try {
      await new Promise<void>((resolve, reject) => {
        const child = exec('git credential reject', (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        child.stdin?.write(credentialInput);
        child.stdin?.end();
      });
    } catch {
      // Fallback: remove from .git-credentials file (only this specific repo)
      const credentialStorePath = path.join(os.homedir(), '.git-credentials');
      if (fs.existsSync(credentialStorePath)) {
        const content = fs.readFileSync(credentialStorePath, 'utf8');
        const repoIdentifier = `@${parsed.host}${parsed.path}`;
        const lines = content.split('\n').filter(line => !line.includes(repoIdentifier));
        fs.writeFileSync(credentialStorePath, lines.join('\n'), { mode: 0o600 });
      }
    }
  }

  /**
   * Configure Git credential helper to use system store
   */
  private async configureCredentialHelper(): Promise<void> {
    try {
      const { stdout } = await execAsync('git config --global credential.helper');
      if (stdout.trim()) {
        return; // Already configured
      }
    } catch {
      // Not configured
    }

    const platform = process.platform;
    let helper: string;

    if (platform === 'darwin') {
      helper = 'osxkeychain';
    } else if (platform === 'win32') {
      helper = 'manager';
    } else {
      // Linux - prefer libsecret (GNOME Keyring), fall back to store
      try {
        await execAsync('which git-credential-libsecret');
        helper = 'libsecret';
      } catch {
        helper = 'store';
      }
    }

    await execAsync(`git config --global credential.helper ${helper}`);
  }

  /**
   * Parse Git URL to extract protocol, host, and path (for per-repository credentials)
   */
  private parseGitUrl(url: string): { protocol: string; host: string; path: string } | null {
    // Handle https://host/owner/repo.git or https://host/owner/repo
    if (url.startsWith('https://')) {
      const match = url.match(/https:\/\/([^/]+)(\/.*)?/);
      if (match) {
        let repoPath = match[2] || '';
        // Normalize path: ensure it starts with / and ends with .git
        if (repoPath && !repoPath.endsWith('.git')) {
          repoPath = repoPath.replace(/\/$/, '') + '.git';
        }
        return { protocol: 'https', host: match[1], path: repoPath };
      }
    }
    // Handle http://host/owner/repo
    if (url.startsWith('http://')) {
      const match = url.match(/http:\/\/([^/]+)(\/.*)?/);
      if (match) {
        let repoPath = match[2] || '';
        if (repoPath && !repoPath.endsWith('.git')) {
          repoPath = repoPath.replace(/\/$/, '') + '.git';
        }
        return { protocol: 'http', host: match[1], path: repoPath };
      }
    }
    // Handle git@host:owner/repo.git
    if (url.startsWith('git@')) {
      const match = url.match(/git@([^:]+):(.+)/);
      if (match) {
        let repoPath = '/' + match[2];
        if (!repoPath.endsWith('.git')) {
          repoPath = repoPath.replace(/\/$/, '') + '.git';
        }
        return { protocol: 'https', host: match[1], path: repoPath };
      }
    }
    return null;
  }

  /**
   * Set repository URL
   */
  async setRepositoryUrl(url: string): Promise<void> {
    await vscode.workspace.getConfiguration('antigravitySync')
      .update('repositoryUrl', url, vscode.ConfigurationTarget.Global);
  }

  /**
   * Parse repository URL to get owner and repo name
   */
  parseRepositoryUrl(url: string): { owner: string; repo: string } | null {
    // Handle various URL formats
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git

    const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  }
}
