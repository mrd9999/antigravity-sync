/**
 * GitService - Local Git operations wrapper
 */
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

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
