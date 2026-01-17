/**
 * GitService - Local Git operations wrapper
 */
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type LogType = 'info' | 'success' | 'error';
export type LoggerCallback = (message: string, type: LogType) => void;

export class GitService {
  private git: SimpleGit;
  private repoPath: string;
  private logger?: LoggerCallback;

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
   * Set logger callback for sending logs to UI
   */
  setLogger(logger: LoggerCallback): void {
    this.logger = logger;
  }

  /**
   * Log message to both console and UI (if logger is set)
   */
  private log(message: string, type: LogType = 'info'): void {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const formattedMessage = `[${timestamp}] ${message}`;
    console.log(formattedMessage);
    if (this.logger) {
      this.logger(formattedMessage, type);
    }
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
   * Resolve binary file conflict using Smart Resolution:
   * - If size difference > 20%: keep larger (more content)
   * - Else: keep newer (more recent)
   * @returns 'local' or 'remote' indicating which version was kept
   */
  private async resolveBinaryConflict(relativePath: string): Promise<'local' | 'remote'> {
    const SIZE_DIFF_THRESHOLD = 0.2; // 20%

    // Get local file info from working directory
    const localFilePath = path.join(this.repoPath, relativePath);
    const localExists = fs.existsSync(localFilePath);
    const localStats = localExists ? fs.statSync(localFilePath) : null;
    const localSize = localStats?.size || 0;
    const localMtime = localStats?.mtime || new Date(0);

    // Get remote file info from git
    let remoteSize = 0;
    let remoteMtime = new Date(0);
    try {
      // Get remote file content to determine size
      const content = await this.git.show([`origin/main:${relativePath}`]);
      remoteSize = Buffer.byteLength(content, 'binary');

      // Get remote commit time for this file
      const log = await this.git.log({ file: relativePath, maxCount: 1 });
      if (log.latest?.date) {
        remoteMtime = new Date(log.latest.date);
      }
    } catch {
      // File might not exist in remote, that's OK
    }

    // Calculate size difference ratio
    const maxSize = Math.max(localSize, remoteSize);
    const sizeDiffRatio = maxSize > 0 ? Math.abs(localSize - remoteSize) / maxSize : 0;

    let keepLocal: boolean;

    if (sizeDiffRatio > SIZE_DIFF_THRESHOLD) {
      // Large size difference → keep larger file (more content = more important)
      keepLocal = localSize >= remoteSize;
      this.log(`[Conflict] ${relativePath}: size diff ${(sizeDiffRatio * 100).toFixed(0)}% (local: ${localSize}, remote: ${remoteSize}) → keep ${keepLocal ? 'local' : 'remote'} (larger)`);
    } else {
      // Similar size → keep newer file
      keepLocal = localMtime >= remoteMtime;
      this.log(`[Conflict] ${relativePath}: similar size → keep ${keepLocal ? 'local' : 'remote'} (newer: ${keepLocal ? localMtime.toISOString() : remoteMtime.toISOString()})`);
    }

    // Resolve conflict by checking out the chosen version
    if (keepLocal) {
      await this.git.raw(['checkout', '--ours', relativePath]);
    } else {
      await this.git.raw(['checkout', '--theirs', relativePath]);
    }
    await this.git.add(relativePath);

    return keepLocal ? 'local' : 'remote';
  }

  /**
   * Handle Smart Merge - resolve conflicts using larger/newer wins strategy
   * @param hasStash - whether there's a stash to pop
   */
  private async handleSmartMerge(hasStash: boolean): Promise<void> {
    this.log('[SmartSync] === SMART MERGE STARTED ===');

    // Step 1: Cleanup stale git state
    this.log('[SmartSync] Step 1: Cleaning up stale git state...');
    const rebaseAbortResult = await this.git.rebase({ '--abort': null }).catch(e => `rebase abort: ${e.message}`);
    this.log(`[SmartSync] Rebase abort result: ${rebaseAbortResult}`);
    const mergeAbortResult = await this.git.raw(['merge', '--abort']).catch(e => `merge abort: ${e.message}`);
    this.log(`[SmartSync] Merge abort result: ${mergeAbortResult}`);
    this.cleanupIndexLock();
    this.log('[SmartSync] Index lock cleaned');

    // Step 2: Pop stash if any
    if (hasStash) {
      this.log('[SmartSync] Step 2: Popping stash...');
      const stashPopResult = await this.git.stash(['pop']).catch(e => `stash pop failed: ${e.message}`);
      this.log(`[SmartSync] Stash pop result: ${stashPopResult}`);
    }

    // Step 3: Hard reset to clear ANY corrupt index state
    this.log('[SmartSync] Step 3: Hard resetting to HEAD...');
    await this.git.reset(['--hard', 'HEAD']).catch(e => this.log(`[SmartSync] Reset failed: ${e.message}`));

    // Step 4: Fetch latest remote
    this.log('[SmartSync] Step 4: Fetching origin...');
    await this.git.fetch('origin');
    this.log('[SmartSync] Fetch complete');

    // Step 5: Get files that differ between local and remote
    this.log('[SmartSync] Step 5: Getting differing files...');
    let differingFiles: string[] = [];
    try {
      const diffOutput = await this.git.raw(['diff', '--name-only', 'HEAD', 'origin/main']);
      differingFiles = diffOutput.split('\n').filter(f => f.trim().length > 0);
      this.log(`[SmartSync] Diff output (${differingFiles.length} files): ${differingFiles.slice(0, 10).join(', ')}${differingFiles.length > 10 ? '...' : ''}`);
    } catch (diffError) {
      this.log(`[SmartSync] Diff failed: ${(diffError as Error).message}`);
      differingFiles = [];
    }

    const binaryExtensions = ['.pb', '.pbtxt', '.png', '.jpg', '.webp', '.gif'];
    const binaryFiles = differingFiles.filter(f => binaryExtensions.some(ext => f.endsWith(ext)));
    this.log(`[SmartSync] Found ${binaryFiles.length} binary files to resolve`);

    // Step 6: For binary files, apply Smart Resolution
    this.log('[SmartSync] Step 6: Applying Smart Resolution to binary files...');
    for (const file of binaryFiles) {
      try {
        // Get local file info
        const localFilePath = path.join(this.repoPath, file);
        const localExists = fs.existsSync(localFilePath);
        const localStats = localExists ? fs.statSync(localFilePath) : null;
        const localSize = localStats?.size || 0;
        const localMtime = localStats?.mtime || new Date(0);

        // Get remote file info
        let remoteSize = 0;
        let remoteMtime = new Date(0);
        try {
          const content = await this.git.show([`origin/main:${file}`]);
          remoteSize = Buffer.byteLength(content, 'binary');
          const log = await this.git.log({ file, maxCount: 1 });
          if (log.latest?.date) remoteMtime = new Date(log.latest.date);
        } catch { /* remote might not have file */ }

        // Decide: larger wins if diff > 20%, else newer wins
        const sizeDiffRatio = Math.max(localSize, remoteSize) > 0
          ? Math.abs(localSize - remoteSize) / Math.max(localSize, remoteSize)
          : 0;

        let keepLocal: boolean;
        if (sizeDiffRatio > 0.2) {
          keepLocal = localSize >= remoteSize;
          this.log(`[SmartSync] ${file}: size ${localSize} vs ${remoteSize} (${(sizeDiffRatio * 100).toFixed(0)}%) → keep ${keepLocal ? 'LOCAL' : 'REMOTE'} (larger)`);
        } else {
          keepLocal = localMtime >= remoteMtime;
          this.log(`[SmartSync] ${file}: similar size → keep ${keepLocal ? 'LOCAL' : 'REMOTE'} (newer)`);
        }

        // If remote wins, checkout remote version
        if (!keepLocal) {
          this.log(`[SmartSync] Checking out remote version of ${file}...`);
          await this.git.raw(['checkout', 'origin/main', '--', file]).catch(e =>
            this.log(`[SmartSync] Checkout failed: ${e.message}`)
          );
        }
        // If local wins, keep current file (do nothing)
      } catch (err) {
        this.log(`[SmartSync] Error processing ${file}: ${(err as Error).message}`);
      }
    }

    // Step 7: Stage all changes
    this.log('[SmartSync] Step 7: Staging all changes...');
    await this.git.add('-A');
    const statusAfterAdd = await this.git.status();
    this.log(`[SmartSync] Status after add: ${statusAfterAdd.files.length} staged, conflicted: ${statusAfterAdd.conflicted?.length || 0}`);

    // Step 8: Commit merged result
    this.log('[SmartSync] Step 8: Committing...');
    const commitResult = await this.git.commit('Sync: smart merge (larger/newer wins)').catch(e => `commit failed: ${e.message}`);
    this.log(`[SmartSync] Commit result: ${JSON.stringify(commitResult)}`);

    // Step 9: Force push to resolve divergence
    this.log('[SmartSync] Step 9: Force pushing...');
    const pushResult = await this.git.push('origin', 'main', ['--force']).catch(e => `push failed: ${e.message}`);
    this.log(`[SmartSync] Push result: ${JSON.stringify(pushResult)}`);

    this.log('[SmartSync] === SMART MERGE COMPLETE ===');
  }

  /**
   * Pull from remote (handles divergent branches with rebase)
   */
  async pull(): Promise<void> {
    this.log('[GitService.pull] Starting pull...');
    try {
      // Check initial status
      const status = await this.git.status();
      const hasChanges = status.files.length > 0;
      const hasPreExistingConflicts = (status.conflicted?.length || 0) > 0;
      this.log(`[GitService.pull] Status: ${status.files.length} files, hasChanges=${hasChanges}`);
      this.log(`[GitService.pull] Conflicted files: ${status.conflicted?.length || 0}`);
      this.log(`[GitService.pull] Pre-existing conflicts: ${hasPreExistingConflicts}`);

      // If there are pre-existing conflicts (ghost conflict state), handle them first
      if (hasPreExistingConflicts) {
        this.log('[GitService.pull] Pre-existing conflicts detected, jumping to Smart Merge...');
        await this.handleSmartMerge(false); // false = no stash to pop
        return;
      }

      if (hasChanges) {
        this.log('[GitService.pull] Stashing local changes...');
        await this.git.stash(['push', '-m', 'antigravity-sync-temp']);
      }

      try {
        // Try pull with rebase to handle divergent branches
        this.log('[GitService.pull] Attempting pull --rebase...');
        await this.git.pull('origin', 'main', { '--rebase': 'true' });
        this.log('[GitService.pull] Pull successful!');
      } catch (error: unknown) {
        const gitError = error as { message?: string };
        this.log(`[GitService.pull] Pull failed: ${gitError.message}`);

        // Empty repo - no remote branches yet, skip pull
        if (gitError.message?.includes("couldn't find remote ref")) {
          this.log('[GitService.pull] Empty repo, skipping pull');
          // Pop stash if we had changes
          if (hasChanges) {
            await this.git.stash(['pop']).catch(() => { });
          }
          return;
        }

        // Divergent branches or rebase conflict - use "Smart Merge" strategy
        if (gitError.message?.includes('divergent') ||
          gitError.message?.includes('reconcile') ||
          gitError.message?.includes('CONFLICT') ||
          gitError.message?.includes('conflict') ||
          gitError.message?.includes('Exiting') ||
          gitError.message?.includes('unresolved') ||
          gitError.message?.includes('needs merge') ||
          gitError.message?.includes('could not write index') ||
          gitError.message?.includes('index.lock')) {

          this.log(`[GitService.pull] Conflict detected, calling handleSmartMerge(hasChanges=${hasChanges})...`);
          await this.handleSmartMerge(hasChanges);
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
