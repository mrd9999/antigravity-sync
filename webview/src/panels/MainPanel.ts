/**
 * Main Panel Component - Modern Redesign
 */
import { vscode } from '../index';

export class MainPanel {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(): void {
    this.container.innerHTML = `
      <div class="main-panel">
        <section id="config-section" class="config-section">
          <div class="section-header">
            <span class="codicon codicon-gear"></span>
            <h3>Setup</h3>
          </div>
          
          <p class="description">Sync your Gemini context to a private Git repository.</p>
          
          <div class="form-group">
            <label for="repo-url-input">Repository URL</label>
            <vscode-text-field id="repo-url-input" placeholder="https://host/user/repo" class="full-width"></vscode-text-field>
          </div>
          
          <div class="form-group">
            <label for="pat-input">Access Token</label>
            <vscode-text-field id="pat-input" type="password" placeholder="Token with repo access" class="full-width"></vscode-text-field>
            <span class="hint">Token needs repository read/write access</span>
          </div>
          
          <vscode-button id="btn-save-config" class="full-width" style="display: flex; justify-content: center; text-align: center;">
            <span id="btn-connect-text" style="width: 100%; text-align: center;">Connect Repository</span>
            <span id="btn-connect-spinner" class="codicon codicon-sync codicon-modifier-spin" style="display: none;"></span>
          </vscode-button>
          
          <div id="config-error" class="error-box" style="display: none;"></div>
        </section>

        <!-- Auto Retry Section (CDP-based) -->
        <section class="auto-retry-section" id="auto-retry-section">
          <vscode-divider></vscode-divider>
          <div class="section-header">
            <span class="codicon codicon-zap"></span>
            <span class="section-title">Auto Retry</span>
          </div>
          <p class="description" style="font-size: 11px; opacity: 0.8; margin: 0 0 8px 0;">
            Auto-click Retry buttons when AI agent encounters errors
          </p>
          
          <!-- Single Start/Stop Button -->
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <vscode-button id="btn-start-auto-accept" appearance="primary" style="flex: 1;">
              <span class="codicon codicon-play"></span>
              Start Auto Retry
            </vscode-button>
            <vscode-button id="btn-stop-auto-accept" appearance="secondary" style="flex: 1; display: none;">
              <span class="codicon codicon-debug-stop"></span>
              Stop
            </vscode-button>
          </div>
          
          <div id="auto-retry-log" class="log-output" style="margin-top: 8px; max-height: 120px;">
            <div class="log-empty">Click Start to enable auto-retry</div>
          </div>
        </section>

        <!-- Main Dashboard (shown when configured) -->
        <section id="dashboard-section" class="dashboard-section" style="display: none;">
          <!-- Status Card -->
          <div class="status-card">
            <div class="status-indicator" id="status-indicator">
              <span class="codicon codicon-check" id="status-icon"></span>
            </div>
            <div class="status-info">
              <span class="status-text" id="status-text">Synced</span>
              <span class="status-time" id="last-sync-time">Just now</span>
            </div>
            <div class="sync-countdown" id="sync-countdown" title="Auto-sync countdown">
              <span id="countdown-value">--:--</span>
            </div>
            <vscode-button appearance="icon" id="btn-sync-icon" title="Sync now">
              <span class="codicon codicon-sync"></span>
            </vscode-button>
          </div>

          <!-- Quick Actions -->
          <div class="quick-actions">
            <vscode-button appearance="secondary" id="btn-push">
              <span class="codicon codicon-cloud-upload"></span>
              Push
            </vscode-button>
            <vscode-button appearance="secondary" id="btn-pull">
              <span class="codicon codicon-cloud-download"></span>
              Pull
            </vscode-button>
          </div>

          <!-- Sync Toggle -->
          <div class="sync-toggle-section">
            <div class="toggle-row">
              <span class="toggle-label">Sync Enabled</span>
              <vscode-checkbox id="sync-enabled-toggle" checked></vscode-checkbox>
            </div>
          </div>

          <vscode-divider></vscode-divider>

          <!-- Repository Info -->
          <div class="repo-section">
            <div class="section-header">
              <span class="codicon codicon-repo"></span>
              <span class="section-title">Repository</span>
              <vscode-button appearance="icon" id="btn-disconnect" title="Disconnect">
                <span class="codicon codicon-close"></span>
              </vscode-button>
            </div>
            <div class="repo-url" id="repo-display">host/user/repo</div>
          </div>

          <vscode-divider></vscode-divider>

          <!-- Folders Section -->
          <div class="folders-section">
            <div class="section-header">
              <span class="codicon codicon-folder"></span>
              <span class="section-title">Sync Folders</span>
            </div>
            <div class="folder-list" id="folder-list">
              <label class="folder-item">
                <vscode-checkbox checked id="folder-knowledge">knowledge/</vscode-checkbox>
              </label>
              <label class="folder-item">
                <vscode-checkbox id="folder-brain">brain/</vscode-checkbox>
              </label>
              <label class="folder-item">
                <vscode-checkbox id="folder-conversations">conversations/</vscode-checkbox>
              </label>
            </div>
          </div>

          <vscode-divider></vscode-divider>

          <!-- Git Status -->
          <div class="git-status-section">
            <div class="section-header">
              <span class="section-title">SYNC STATUS</span>
              <vscode-button appearance="icon" id="btn-refresh-status" title="Refresh status">
                <span id="refresh-icon" class="codicon codicon-sync"></span>
              </vscode-button>
            </div>
            <div class="git-status-content" id="git-status-content">
              <div class="git-summary" id="git-summary">
                <div class="git-stat">
                  <span class="git-stat-value" id="git-files-count">0</span>
                  <span class="git-stat-label">files to push</span>
                </div>
                <div class="git-stat">
                  <span class="git-stat-value" id="git-behind-count">0</span>
                  <span class="git-stat-label">commits to pull</span>
                </div>
              </div>
              <div class="git-files" id="git-files">
                <div class="git-files-empty">No pending changes</div>
              </div>
              <div class="git-hint">
                <code>cd ~/.gemini-sync-repo && git status</code>
              </div>
            </div>
          </div>

          <vscode-divider></vscode-divider>

          <!-- Log Output -->
          <div class="log-section">
            <div class="section-header">
              <span class="codicon codicon-terminal"></span>
              <span class="section-title">Sync Log</span>
              <vscode-button appearance="icon" id="btn-clear-log" title="Clear log">
                <span class="codicon codicon-clear-all"></span>
              </vscode-button>
            </div>
            <div class="log-output" id="log-output">
              <div class="log-empty">Ready</div>
            </div>
          </div>
        </section>

        <!-- Error Display -->
        <div id="global-error" class="global-error" style="display: none;">
          <span class="codicon codicon-error"></span>
          <span id="error-message"></span>
          <vscode-button appearance="icon" id="btn-dismiss-error">
            <span class="codicon codicon-close"></span>
          </vscode-button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.checkConfigured();
  }

  private checkConfigured(): void {
    // Check if already configured - request state from extension
    vscode.postMessage({ type: 'checkConfig' });
  }

  private attachEventListeners(): void {
    // Save config button
    document.getElementById('btn-save-config')?.addEventListener('click', () => {
      const repoInput = document.getElementById('repo-url-input') as HTMLInputElement;
      const patInput = document.getElementById('pat-input') as HTMLInputElement;

      // Show loading state
      setConnectLoading(true);

      vscode.postMessage({
        type: 'saveConfig',
        repoUrl: repoInput?.value || '',
        pat: patInput?.value || ''
      });
    });

    // Sync button (icon)
    document.getElementById('btn-sync-icon')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'syncNow' });
    });

    // Push button
    document.getElementById('btn-push')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'push' });
    });

    // Pull button
    document.getElementById('btn-pull')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'pull' });
    });

    // Disconnect button
    document.getElementById('btn-disconnect')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'disconnect' });
    });

    // Dismiss error
    document.getElementById('btn-dismiss-error')?.addEventListener('click', () => {
      const errorEl = document.getElementById('global-error');
      if (errorEl) errorEl.style.display = 'none';
    });

    // Folder checkboxes
    ['knowledge', 'antigravity', 'brain', 'conversations'].forEach(folder => {
      document.getElementById(`folder-${folder}`)?.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        vscode.postMessage({
          type: 'toggleFolder',
          folder: folder,
          enabled: target.checked
        });
      });
    });

    // Sync enabled toggle
    document.getElementById('sync-enabled-toggle')?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      vscode.postMessage({
        type: 'toggleSyncEnabled',
        enabled: target.checked
      });
    });

    // Refresh git status
    document.getElementById('btn-refresh-status')?.addEventListener('click', () => {
      setRefreshLoading(true);
      vscode.postMessage({ type: 'getGitStatus' });
    });

    // Clear log button
    document.getElementById('btn-clear-log')?.addEventListener('click', () => {
      clearLog();
    });

    // Auto Retry - Start
    document.getElementById('btn-start-auto-accept')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'startAutoRetry' });
    });

    // Auto Retry - Stop
    document.getElementById('btn-stop-auto-accept')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'stopAutoRetry' });
    });
  }
}

// Export function to update UI from extension messages
export function showConfigured(configured: boolean, repoUrl?: string, syncFolders?: string[]): void {
  const configSection = document.getElementById('config-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const repoDisplay = document.getElementById('repo-display');

  // Reset loading state
  setConnectLoading(false);

  if (configSection && dashboardSection) {
    configSection.style.display = configured ? 'none' : 'block';
    dashboardSection.style.display = configured ? 'block' : 'none';
  }

  if (repoDisplay && repoUrl) {
    // Show full URL
    repoDisplay.textContent = repoUrl;
  }

  // Update folder checkboxes from saved settings
  if (syncFolders) {
    updateFolderCheckboxes(syncFolders);
  }
}

export function updateFolderCheckboxes(syncFolders: string[]): void {
  const folders = ['knowledge', 'brain', 'conversations'];
  for (const folder of folders) {
    const checkbox = document.getElementById(`folder-${folder}`) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = syncFolders.includes(folder);
    }
  }
}

export function updateStatus(status: 'synced' | 'syncing' | 'error' | 'pending', lastSync?: string): void {
  const indicator = document.getElementById('status-indicator');
  const icon = document.getElementById('status-icon');
  const text = document.getElementById('status-text');
  const time = document.getElementById('last-sync-time');

  if (indicator && icon && text) {
    indicator.className = `status-indicator status-${status}`;

    const iconMap: Record<string, string> = {
      synced: 'codicon-check',
      syncing: 'codicon-sync codicon-modifier-spin',
      error: 'codicon-error',
      pending: 'codicon-clock'
    };

    const textMap: Record<string, string> = {
      synced: 'Synced',
      syncing: 'Syncing...',
      error: 'Sync Error',
      pending: 'Changes pending'
    };

    icon.className = `codicon ${iconMap[status]}`;
    text.textContent = textMap[status];
  }

  if (time && lastSync) {
    time.textContent = formatRelativeTime(lastSync);
  }
}

export function showError(message: string): void {
  const errorEl = document.getElementById('global-error');
  const errorMsg = document.getElementById('error-message');

  if (errorEl && errorMsg) {
    errorMsg.textContent = message;
    errorEl.style.display = 'flex';
  }
}

export function showConfigError(message: string): void {
  const errorEl = document.getElementById('config-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  // Reset loading state on error
  setConnectLoading(false);
}

export function setConnectLoading(loading: boolean): void {
  const btn = document.getElementById('btn-save-config') as HTMLButtonElement;
  const text = document.getElementById('btn-connect-text');
  const spinner = document.getElementById('btn-connect-spinner');

  if (btn) {
    btn.disabled = loading;
  }
  if (text) {
    text.style.display = loading ? 'none' : 'inline';
  }
  if (spinner) {
    spinner.style.display = loading ? 'inline' : 'none';
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function appendLog(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const logOutput = document.getElementById('log-output');
  if (!logOutput) return;

  // Remove empty message
  const empty = logOutput.querySelector('.log-empty');
  if (empty) empty.remove();

  // Create new log line
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = message;

  // Add to bottom
  logOutput.appendChild(line);

  // Auto-scroll to bottom
  logOutput.scrollTop = logOutput.scrollHeight;

  // Keep only last 50 lines
  while (logOutput.children.length > 50) {
    logOutput.firstChild?.remove();
  }
}

export function clearLog(): void {
  const logOutput = document.getElementById('log-output');
  if (!logOutput) return;
  logOutput.innerHTML = '<div class="log-empty">Ready</div>';
}

export function updateGitStatus(data: {
  ahead: number;
  behind: number;
  files: string[];
  totalFiles: number;
  syncRepoPath: string;
}): void {
  const filesCountEl = document.getElementById('git-files-count');
  const behindCountEl = document.getElementById('git-behind-count');
  const filesEl = document.getElementById('git-files');
  const refreshIcon = document.getElementById('refresh-icon');

  // Stop loading animation
  if (refreshIcon) {
    refreshIcon.classList.remove('codicon-modifier-spin');
  }

  // Update files count
  if (filesCountEl) {
    filesCountEl.textContent = String(data.totalFiles);
    filesCountEl.className = data.totalFiles > 0 ? 'git-stat-value has-changes' : 'git-stat-value';
  }

  // Update behind count
  if (behindCountEl) {
    behindCountEl.textContent = String(data.behind);
    behindCountEl.className = data.behind > 0 ? 'git-stat-value has-pull' : 'git-stat-value';
  }

  // Update files list
  if (filesEl) {
    if (data.files.length === 0) {
      filesEl.innerHTML = '<div class="git-files-empty">No pending changes</div>';
    } else {
      let html = '<div class="git-files-list">';
      data.files.forEach(file => {
        html += `<div class="git-file-item">${file}</div>`;
      });
      if (data.totalFiles > data.files.length) {
        html += `<div class="git-file-more">...and ${data.totalFiles - data.files.length} more</div>`;
      }
      html += '</div>';
      filesEl.innerHTML = html;
    }
  }
}

export function setRefreshLoading(loading: boolean): void {
  const refreshIcon = document.getElementById('refresh-icon');
  if (refreshIcon) {
    if (loading) {
      refreshIcon.classList.add('codicon-modifier-spin');
    } else {
      refreshIcon.classList.remove('codicon-modifier-spin');
    }
  }
}

export function updateCountdown(seconds: number): void {
  const countdownEl = document.getElementById('countdown-value');
  if (countdownEl) {
    if (seconds <= 0) {
      countdownEl.textContent = '--:--';
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }
}

export function updateAutoRetryStatus(running: boolean, retryCount: number, connectionCount?: number): void {
  const startBtn = document.getElementById('btn-start-auto-accept');
  const stopBtn = document.getElementById('btn-stop-auto-accept');
  const cdpIcon = document.getElementById('cdp-status-icon');
  const cdpText = document.getElementById('cdp-status-text');

  if (startBtn && stopBtn) {
    startBtn.style.display = running ? 'none' : 'inline-flex';
    stopBtn.style.display = running ? 'inline-flex' : 'none';
  }

  // Update CDP connection status if running
  if (running && connectionCount !== undefined && cdpIcon && cdpText) {
    cdpIcon.className = 'codicon codicon-check';
    cdpIcon.style.color = 'var(--vscode-debugIcon-startForeground)';
    cdpText.textContent = `CDP: ${connectionCount} page(s) connected`;
  }
}

export function updateCDPStatus(available: boolean, hasFlag: boolean, port: number): void {
  const cdpIcon = document.getElementById('cdp-status-icon');
  const cdpText = document.getElementById('cdp-status-text');
  const setupBtn = document.getElementById('btn-setup-cdp');
  const logOutput = document.getElementById('auto-retry-log');

  if (cdpIcon && cdpText) {
    if (available) {
      cdpIcon.className = 'codicon codicon-check';
      cdpIcon.style.color = 'var(--vscode-debugIcon-startForeground)';
      cdpText.textContent = `CDP: Connected (port ${port})`;
    } else if (hasFlag) {
      cdpIcon.className = 'codicon codicon-warning';
      cdpIcon.style.color = 'var(--vscode-debugIcon-pauseForeground)';
      cdpText.textContent = 'CDP: Has flag but not responding';
    } else {
      cdpIcon.className = 'codicon codicon-circle-outline';
      cdpIcon.style.color = 'var(--vscode-debugIcon-disconnectForeground)';
      cdpText.textContent = `CDP: Not connected (port ${port})`;
    }
  }

  // Update setup button visibility
  if (setupBtn) {
    setupBtn.style.display = available ? 'none' : 'inline-flex';
  }

  // Update log hint
  if (logOutput && !available) {
    const empty = logOutput.querySelector('.log-empty');
    if (empty) {
      empty.textContent = hasFlag
        ? 'CDP not responding. Try restarting IDE.'
        : `Click "Setup CDP" then restart IDE with --remote-debugging-port=${port}`;
    }
  }
}

export function appendAutoRetryLog(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const logOutput = document.getElementById('auto-retry-log');
  if (!logOutput) return;

  // Remove empty message
  const empty = logOutput.querySelector('.log-empty');
  if (empty) empty.remove();

  // Create new log line
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = message;

  // Add to bottom
  logOutput.appendChild(line);

  // Auto-scroll to bottom
  logOutput.scrollTop = logOutput.scrollHeight;

  // Keep only last 20 lines
  while (logOutput.children.length > 20) {
    logOutput.firstChild?.remove();
  }
}
