/**
 * SyncService - Core sync orchestration
 * Provider-agnostic: works with any Git remote (GitHub, GitLab, Bitbucket, etc.)
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './ConfigService';
import { GitService } from './GitService';
import { FilterService } from './FilterService';
import { StatusBarService, SyncState } from './StatusBarService';

export interface SyncStatus {
  syncStatus: string;
  lastSync: string | null;
  pendingChanges: number;
  repository: string | null;
}

// Helper to format timestamp
function ts(): string {
  const now = new Date();
  return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}]`;
}

// Default auto-sync interval: 5 minutes
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export class SyncService {
  private context: vscode.ExtensionContext;
  private configService: ConfigService;
  private statusBar: StatusBarService;
  private gitService: GitService | null = null;
  private filterService: FilterService | null = null;
  private isSyncing = false;

  // Auto-sync timer
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private nextSyncTime: number = 0;
  private countdownCallback: ((seconds: number) => void) | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;

  constructor(
    context: vscode.ExtensionContext,
    configService: ConfigService,
    statusBar: StatusBarService
  ) {
    this.context = context;
    this.configService = configService;
    this.statusBar = statusBar;
  }

  /**
   * Initialize sync - setup git and filter services
   * Works with any Git provider (GitHub, GitLab, Bitbucket, etc.)
   */
  async initialize(): Promise<void> {
    const config = this.configService.getConfig();
    const token = await this.configService.getCredentials();

    if (!config.repositoryUrl || !token) {
      throw new Error('Repository or access token not configured');
    }

    // Initialize Git service
    const syncRepoPath = this.configService.getSyncRepoPath();
    this.gitService = new GitService(syncRepoPath);
    await this.gitService.initializeRepository(config.repositoryUrl, token);

    // Initialize filter service
    this.filterService = new FilterService(
      config.geminiPath,
      config.excludePatterns
    );

    // Copy initial files
    await this.copyFilesToSyncRepo();

    // Status is Pending until first push
    this.statusBar.update(SyncState.Pending);
  }

  /**
   * Full sync (push + pull)
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncService.sync] Already syncing, skipping...');
      return;
    }

    this.isSyncing = true;
    this.statusBar.update(SyncState.Syncing);
    console.log('[SyncService.sync] === SYNC STARTED ===');

    try {
      // Pull remote changes first
      console.log('[SyncService.sync] Step 1: Pulling remote changes...');
      await this.pull();

      // Push local changes (no need to pull again, already done)
      console.log('[SyncService.sync] Step 2: Pushing local changes...');
      await this.pushWithoutPull();

      console.log('[SyncService.sync] === SYNC COMPLETE ===');
      this.statusBar.update(SyncState.Synced);
    } catch (error) {
      console.log(`[SyncService.sync] Sync failed: ${(error as Error).message}`);
      this.statusBar.update(SyncState.Error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Push local changes to remote
   */
  async push(): Promise<void> {
    if (!this.gitService) {
      throw new Error('Sync not initialized');
    }

    this.statusBar.update(SyncState.Pushing);
    console.log('[SyncService.push] === PUSH STARTED ===');

    try {
      // Pull first to avoid divergent branches (when called standalone)
      console.log('[SyncService.push] Step 1: Pulling to avoid divergence...');
      await this.gitService.pull();

      // Copy filtered files to sync repo
      console.log('[SyncService.push] Step 2: Copying local files to sync repo...');
      const filesCopied = await this.copyFilesToSyncRepo();
      console.log(`[SyncService.push] Copied ${filesCopied} files to sync repo`);

      // Stage and commit
      console.log('[SyncService.push] Step 3: Staging and committing...');
      await this.gitService.stageAll();
      const commitHash = await this.gitService.commit(
        `Sync: ${new Date().toISOString()}`
      );

      if (commitHash) {
        console.log(`[SyncService.push] Step 4: Pushing commit ${commitHash.substring(0, 7)}...`);
        await this.gitService.push();
        console.log('[SyncService.push] Push successful!');
      } else {
        console.log('[SyncService.push] No changes to commit');
      }

      console.log('[SyncService.push] === PUSH COMPLETE ===');
      this.statusBar.update(SyncState.Synced);
    } catch (error) {
      console.log(`[SyncService.push] Push failed: ${(error as Error).message}`);
      this.statusBar.update(SyncState.Error);
      throw error;
    }
  }

  /**
   * Push without initial pull (used by sync() to avoid double pull)
   */
  private async pushWithoutPull(): Promise<void> {
    if (!this.gitService) {
      throw new Error('Sync not initialized');
    }

    // Copy filtered files to sync repo
    console.log('[SyncService.pushWithoutPull] Copying local files to sync repo...');
    const filesCopied = await this.copyFilesToSyncRepo();
    console.log(`[SyncService.pushWithoutPull] Copied ${filesCopied} files`);

    // Stage and commit
    console.log('[SyncService.pushWithoutPull] Staging and committing...');
    await this.gitService.stageAll();
    const commitHash = await this.gitService.commit(
      `Sync: ${new Date().toISOString()}`
    );

    if (commitHash) {
      console.log(`[SyncService.pushWithoutPull] Pushing commit ${commitHash.substring(0, 7)}...`);
      await this.gitService.push();
      console.log('[SyncService.pushWithoutPull] Push successful!');
    } else {
      console.log('[SyncService.pushWithoutPull] No changes to commit');
    }
  }

  /**
   * Pull remote changes to local
   */
  async pull(): Promise<void> {
    if (!this.gitService) {
      throw new Error('Sync not initialized');
    }

    this.statusBar.update(SyncState.Pulling);
    console.log('[SyncService.pull] === PULL STARTED ===');

    try {
      await this.gitService.pull();

      console.log('[SyncService.pull] Copying files from sync repo to Gemini folder...');
      const filesCopied = await this.copyFilesFromSyncRepo();
      console.log(`[SyncService.pull] Copied ${filesCopied} files to Gemini folder`);

      console.log('[SyncService.pull] === PULL COMPLETE ===');
      this.statusBar.update(SyncState.Synced);
    } catch (error) {
      console.log(`[SyncService.pull] Pull failed: ${(error as Error).message}`);
      this.statusBar.update(SyncState.Error);
      throw error;
    }
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const config = this.configService.getConfig();
    let pendingChanges = 0;
    let lastSync: string | null = null;

    if (this.gitService) {
      pendingChanges = await this.gitService.getPendingChangesCount();
      lastSync = await this.gitService.getLastCommitDate();
    }

    return {
      syncStatus: this.isSyncing ? 'Syncing...' : 'Ready',
      lastSync,
      pendingChanges,
      repository: config.repositoryUrl || null
    };
  }

  /**
   * Copy files only (for refresh status without push)
   */
  async copyFilesOnly(): Promise<void> {
    if (!this.filterService) {
      return;
    }
    await this.copyFilesToSyncRepo();
  }

  /**
   * Get detailed git status for UI
   */
  async getDetailedStatus(): Promise<{
    ahead: number;
    behind: number;
    files: string[];
    totalFiles: number;
  }> {
    if (!this.gitService) {
      return { ahead: 0, behind: 0, files: [], totalFiles: 0 };
    }

    // Fetch from remote first to get accurate behind count
    try {
      await this.gitService.fetch();
    } catch {
      // Ignore fetch errors (offline, etc.)
    }

    const aheadBehind = await this.gitService.getAheadBehind();
    const changedFiles = await this.gitService.getChangedFiles(10);

    return {
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      files: changedFiles.files,
      totalFiles: changedFiles.total
    };
  }

  /**
   * Copy filtered files from gemini folder to sync repo
   * @returns number of files copied
   */
  private async copyFilesToSyncRepo(): Promise<number> {
    const config = this.configService.getConfig();
    const syncRepoPath = this.configService.getSyncRepoPath();

    if (!this.filterService) {
      return 0;
    }

    const filesToSync = await this.filterService.getFilesToSync();
    let copiedCount = 0;

    for (const relativePath of filesToSync) {
      const sourcePath = path.join(config.geminiPath, relativePath);
      const destPath = path.join(syncRepoPath, relativePath);

      // Ensure directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy file
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        copiedCount++;
      }
    }

    return copiedCount;
  }

  /**
   * Copy files from sync repo back to gemini folder
   * @returns number of files copied
   */
  private async copyFilesFromSyncRepo(): Promise<number> {
    const config = this.configService.getConfig();
    const syncRepoPath = this.configService.getSyncRepoPath();

    // Walk sync repo and copy back (excluding .git)
    return await this.copyDirectoryContents(syncRepoPath, config.geminiPath, ['.git']);
  }

  /**
   * Recursively copy directory contents
   * @returns number of files copied
   */
  private async copyDirectoryContents(
    source: string,
    dest: string,
    excludeDirs: string[] = []
  ): Promise<number> {
    if (!fs.existsSync(source)) {
      return 0;
    }

    let count = 0;
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) {
        continue;
      }

      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        count += await this.copyDirectoryContents(sourcePath, destPath, excludeDirs);
      } else {
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(sourcePath, destPath);
        count++;
      }
    }

    return count;
  }

  /**
   * Set callback for countdown updates
   */
  setCountdownCallback(callback: (seconds: number) => void): void {
    this.countdownCallback = callback;
  }

  /**
   * Set logger callback for GitService to send logs to UI
   */
  setGitLogger(logger: (message: string, type: 'info' | 'success' | 'error') => void): void {
    if (this.gitService) {
      this.gitService.setLogger(logger);
    }
  }

  /**
   * Start auto-sync timer
   */
  startAutoSync(): void {
    this.stopAutoSync(); // Clear any existing timer

    this.nextSyncTime = Date.now() + AUTO_SYNC_INTERVAL_MS;

    // Start countdown interval (every second)
    this.countdownInterval = setInterval(() => {
      const secondsLeft = Math.max(0, Math.ceil((this.nextSyncTime - Date.now()) / 1000));
      if (this.countdownCallback) {
        this.countdownCallback(secondsLeft);
      }
    }, 1000);

    // Start sync timer
    this.autoSyncTimer = setInterval(async () => {
      try {
        await this.sync();
        this.nextSyncTime = Date.now() + AUTO_SYNC_INTERVAL_MS;
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, AUTO_SYNC_INTERVAL_MS);
  }

  /**
   * Stop auto-sync timer
   */
  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.nextSyncTime = 0;
    if (this.countdownCallback) {
      this.countdownCallback(0);
    }
  }

  /**
   * Get next sync time in seconds
   */
  getSecondsUntilNextSync(): number {
    if (!this.nextSyncTime) return 0;
    return Math.max(0, Math.ceil((this.nextSyncTime - Date.now()) / 1000));
  }
}
