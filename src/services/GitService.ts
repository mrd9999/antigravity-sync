/**
 * GitService - Local Git operations wrapper
 */
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitService {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;

    // CRITICAL: Ensure directory exists before simpleGit init
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }

    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
      trimmed: true
    };

    this.git = simpleGit(options);
  }

  /**
   * Store credentials in Git credential manager
   * This stores credentials in the system's secure credential store
   */
  async storeCredentials(url: string, token: string): Promise<void> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      throw new Error('Invalid Git URL');
    }

    // Format for git credential store:
    // protocol=https
    // host=github.com
    // username=token (or oauth2 for GitLab)
    // password=<the actual token>
    const isGitLab = url.includes('gitlab');
    const username = isGitLab ? 'oauth2' : 'token';

    const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\nusername=${username}\npassword=${token}\n`;

    try {
      // First, configure credential helper if not set
      await this.configureCredentialHelper();

      // Store the credential using git credential approve
      await new Promise<void>((resolve, reject) => {
        const child = exec('git credential approve', { cwd: this.repoPath }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        child.stdin?.write(credentialInput);
        child.stdin?.end();
      });
    } catch (error) {
      // Fallback: try git credential-store directly
      const credentialStorePath = path.join(require('os').homedir(), '.git-credentials');
      const credentialLine = `${parsed.protocol}://${username}:${token}@${parsed.host}\n`;

      // Read existing credentials and check if this host already exists
      let existingContent = '';
      if (fs.existsSync(credentialStorePath)) {
        existingContent = fs.readFileSync(credentialStorePath, 'utf8');
        // Remove any existing credential for this host
        const lines = existingContent.split('\n').filter(line => !line.includes(`@${parsed.host}`));
        existingContent = lines.join('\n');
        if (existingContent && !existingContent.endsWith('\n')) {
          existingContent += '\n';
        }
      }

      fs.writeFileSync(credentialStorePath, existingContent + credentialLine, { mode: 0o600 });
    }
  }

  /**
   * Retrieve credentials from Git credential manager
   */
  async getCredentials(url: string): Promise<string | undefined> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      return undefined;
    }

    const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\n`;

    try {
      const result = await new Promise<string>((resolve, reject) => {
        let output = '';
        const child = exec('git credential fill', { cwd: this.repoPath }, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        });
        child.stdin?.write(credentialInput);
        child.stdin?.end();
      });

      // Parse the output to extract password
      const passwordMatch = result.match(/password=(.+)/);
      if (passwordMatch) {
        return passwordMatch[1].trim();
      }
    } catch {
      // Fallback: try reading from .git-credentials directly
      const credentialStorePath = path.join(require('os').homedir(), '.git-credentials');
      if (fs.existsSync(credentialStorePath)) {
        const content = fs.readFileSync(credentialStorePath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes(`@${parsed.host}`)) {
            // Extract password from URL format: protocol://username:password@host
            const match = line.match(/:([^:@]+)@/);
            if (match) {
              return match[1];
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Delete credentials from Git credential manager
   */
  async deleteCredentials(url: string): Promise<void> {
    const parsed = this.parseGitUrl(url);
    if (!parsed) {
      return;
    }

    const credentialInput = `protocol=${parsed.protocol}\nhost=${parsed.host}\n`;

    try {
      await new Promise<void>((resolve, reject) => {
        const child = exec('git credential reject', { cwd: this.repoPath }, (error) => {
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
      // Fallback: remove from .git-credentials file
      const credentialStorePath = path.join(require('os').homedir(), '.git-credentials');
      if (fs.existsSync(credentialStorePath)) {
        const content = fs.readFileSync(credentialStorePath, 'utf8');
        const lines = content.split('\n').filter(line => !line.includes(`@${parsed.host}`));
        fs.writeFileSync(credentialStorePath, lines.join('\n'), { mode: 0o600 });
      }
    }
  }

  /**
   * Configure Git credential helper to use system store
   */
  private async configureCredentialHelper(): Promise<void> {
    try {
      // Check if credential helper is already configured globally
      const { stdout } = await execAsync('git config --global credential.helper');
      if (stdout.trim()) {
        return; // Already configured
      }
    } catch {
      // Not configured, set it up
    }

    // Configure credential helper based on platform
    const platform = process.platform;
    let helper: string;

    if (platform === 'darwin') {
      helper = 'osxkeychain';
    } else if (platform === 'win32') {
      helper = 'manager';
    } else {
      // Linux - use store (file-based) or libsecret if available
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
   * Parse Git URL to extract protocol and host
   */
  private parseGitUrl(url: string): { protocol: string; host: string; path: string } | null {
    // Handle https://host/path format
    if (url.startsWith('https://')) {
      const match = url.match(/https:\/\/([^/]+)(\/.*)?/);
      if (match) {
        return { protocol: 'https', host: match[1], path: match[2] || '' };
      }
    }
    // Handle http://host/path format
    if (url.startsWith('http://')) {
      const match = url.match(/http:\/\/([^/]+)(\/.*)?/);
      if (match) {
        return { protocol: 'http', host: match[1], path: match[2] || '' };
      }
    }
    // Handle git@host:path format
    if (url.startsWith('git@')) {
      const match = url.match(/git@([^:]+):(.+)/);
      if (match) {
        return { protocol: 'https', host: match[1], path: '/' + match[2] };
      }
    }
    return null;
  }

  /**
   * Initialize or clone the repository
   */
  async initializeRepository(remoteUrl: string, pat: string): Promise<void> {
    // Create directory if not exists
    if (!fs.existsSync(this.repoPath)) {
      fs.mkdirSync(this.repoPath, { recursive: true });
    }

    // Check if already a git repo
    const isRepo = await this.isGitRepository();

    if (!isRepo) {
      // Build authenticated URL
      const authUrl = this.buildAuthenticatedUrl(remoteUrl, pat);

      // Check if directory has files (after disconnect)
      const hasFiles = fs.readdirSync(this.repoPath).length > 0;

      if (hasFiles) {
        // Directory has files but no .git - init and add remote
        await this.git.init(['--initial-branch=main']);
        await this.git.addRemote('origin', authUrl);

        // Pull remote content (will merge with existing files)
        try {
          await this.git.fetch('origin');
          await this.git.reset(['--hard', 'origin/main']);
        } catch {
          // Remote might be empty, that's OK
        }
      } else {
        // Empty directory - try to clone
        try {
          await simpleGit().clone(authUrl, this.repoPath);
        } catch (error: unknown) {
          // If clone fails (empty repo), init locally
          const gitError = error as { message?: string };
          if (gitError.message?.includes('empty repository')) {
            // Init with initial branch name
            await this.git.init(['--initial-branch=main']);
            await this.git.addRemote('origin', authUrl);

            // Create initial commit immediately to establish HEAD
            const readmePath = path.join(this.repoPath, 'README.md');
            fs.writeFileSync(readmePath, '# Antigravity Sync\n\nGemini context sync repository.\n');
            await this.git.add('README.md');
            await this.git.commit('Initial commit');
          } else {
            throw error;
          }
        }
      }
    }

    // Configure git
    await this.git.addConfig('user.name', 'Antigravity Sync', false, 'local');
    await this.git.addConfig('user.email', 'sync@antigravity.local', false, 'local');
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify token has access to the repository
   * Returns true if token can access repo, throws error otherwise
   */
  async verifyAccess(remoteUrl: string, token: string): Promise<void> {
    const authUrl = this.buildAuthenticatedUrl(remoteUrl, token);
    try {
      // Use ls-remote to verify access without cloning
      await simpleGit().listRemote([authUrl]);
    } catch (error) {
      const gitError = error as { message?: string };
      if (gitError.message?.includes('401') || gitError.message?.includes('403')) {
        throw new Error('Invalid access token or no permission to access this repository');
      }
      if (gitError.message?.includes('could not read')) {
        throw new Error('Repository not found or access denied with this token');
      }
      throw new Error(`Cannot access repository: ${gitError.message || 'Unknown error'}`);
    }
  }

  /**
   * Stage all changes
   */
  async stageAll(): Promise<void> {
    await this.git.add('-A');
  }

  /**
   * Commit changes
   */
  async commit(message: string): Promise<string | null> {
    const status = await this.git.status();

    if (status.isClean()) {
      return null;
    }

    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Push to remote
   */
  async push(): Promise<void> {
    // Push to main
    await this.git.push('origin', 'main', ['--set-upstream']);
  }

  /**
   * Fetch from remote (to update tracking info)
   */
  async fetch(): Promise<void> {
    await this.git.fetch('origin');
  }

  /**
   * Pull from remote (handles divergent branches with rebase)
   */
  async pull(): Promise<void> {
    try {
      // Stash any local changes first
      const status = await this.git.status();
      const hasChanges = status.files.length > 0;

      if (hasChanges) {
        await this.git.stash(['push', '-m', 'antigravity-sync-temp']);
      }

      try {
        // Try pull with rebase to handle divergent branches
        await this.git.pull('origin', 'main', { '--rebase': 'true' });
      } catch (error: unknown) {
        const gitError = error as { message?: string };

        // Empty repo - no remote branches yet, skip pull
        if (gitError.message?.includes("couldn't find remote ref")) {
          // Pop stash if we had changes
          if (hasChanges) {
            await this.git.stash(['pop']).catch(() => { });
          }
          return;
        }

        // Divergent branches or rebase conflict - use "local wins" strategy
        if (gitError.message?.includes('divergent') ||
          gitError.message?.includes('reconcile') ||
          gitError.message?.includes('CONFLICT') ||
          gitError.message?.includes('conflict') ||
          gitError.message?.includes('Exiting') ||
          gitError.message?.includes('unresolved') ||
          gitError.message?.includes('needs merge') ||
          gitError.message?.includes('could not write index') ||
          gitError.message?.includes('index.lock')) {
          // Cleanup any stale git state
          await this.git.rebase({ '--abort': null }).catch(() => { });
          await this.git.raw(['merge', '--abort']).catch(() => { });
          this.cleanupIndexLock();

          // Pop stash first to restore local changes
          if (hasChanges) {
            await this.git.stash(['pop']).catch(() => { });
          }

          // Stage all local changes and commit
          await this.git.add('-A');
          await this.git.commit('Sync: local changes preserved').catch(() => { });

          // Force push local version to remote (local wins)
          await this.git.push('origin', 'main', ['--force']).catch(() => { });
          return;
        }

        // Pop stash before throwing
        if (hasChanges) {
          await this.git.stash(['pop']).catch(() => { });
        }
        throw error;
      }

      // Pop stash after successful pull
      if (hasChanges) {
        await this.git.stash(['pop']).catch(() => { });
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get pending changes count
   */
  async getPendingChangesCount(): Promise<number> {
    const status = await this.git.status();
    return status.files.length;
  }

  /**
   * Get changed files list (max 10)
   */
  async getChangedFiles(maxFiles: number = 10): Promise<{ files: string[]; total: number }> {
    const status = await this.git.status();
    const allFiles = status.files.map(f => f.path);
    return {
      files: allFiles.slice(0, maxFiles),
      total: allFiles.length
    };
  }

  /**
   * Get ahead/behind counts compared to remote
   */
  async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      await this.git.fetch('origin');
      const status = await this.git.status();
      return {
        ahead: status.ahead || 0,
        behind: status.behind || 0
      };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * Get last commit date
   */
  async getLastCommitDate(): Promise<string | null> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest?.date || null;
    } catch {
      return null;
    }
  }

  /**
   * Build authenticated URL for Git operations
   * Supports any Git provider: GitHub, GitLab, Bitbucket, etc.
   */
  private buildAuthenticatedUrl(url: string, token: string): string {
    // Convert https://host/path to https://token@host/path
    // GitLab requires oauth2:token format for PAT
    const isGitLab = url.includes('gitlab');
    const authToken = isGitLab ? `oauth2:${token}` : token;

    if (url.startsWith('https://')) {
      return url.replace('https://', `https://${authToken}@`);
    }
    // Convert git@host:path to https://token@host/path
    if (url.startsWith('git@')) {
      const match = url.match(/git@([^:]+):(.+)/);
      if (match) {
        return `https://${authToken}@${match[1]}/${match[2]}`;
      }
    }
    return url;
  }

  /**
   * Remove stale index.lock if exists (from crashed git process)
   */
  private cleanupIndexLock(): void {
    const lockPath = path.join(this.repoPath, '.git', 'index.lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}
