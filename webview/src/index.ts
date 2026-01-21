/**
 * Webview Entry Point - Modern Redesign
 */
import {
  provideVSCodeDesignSystem,
  vsCodeButton,
  vsCodeCheckbox,
  vsCodeDivider,
  vsCodeTextField
} from '@vscode/webview-ui-toolkit';

// Register VS Code UI Toolkit components
provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeCheckbox(),
  vsCodeDivider(),
  vsCodeTextField()
);

import { MainPanel, showConfigured, updateStatus, showError, showConfigError, appendLog, clearLog, updateGitStatus, setRefreshLoading, updateCountdown, updateAutoRetryStatus, appendAutoRetryLog, updateCDPStatus } from './panels/MainPanel';

// Declare vscode API type
interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// Export vscode API for use in components
export const vscode: VsCodeApi = acquireVsCodeApi();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (app) {
    const mainPanel = new MainPanel(app);
    mainPanel.render();
  }
});

// Handle messages from extension
interface ConfiguredMessage {
  type: 'configured';
  data: { configured: boolean; repoUrl?: string; syncFolders?: string[] };
}

interface StatusMessage {
  type: 'updateStatus';
  data: { status: 'synced' | 'syncing' | 'error' | 'pending'; lastSync?: string };
}

interface ErrorMessage {
  type: 'showError';
  data: { message: string };
}

interface ConfigErrorMessage {
  type: 'configError';
  data: { message: string };
}

interface LogMessage {
  type: 'log';
  data: { message: string; logType: 'success' | 'error' | 'info' };
}

interface ClearLogMessage {
  type: 'clearLog';
  data: Record<string, never>;
}

interface GitStatusMessage {
  type: 'gitStatus';
  data: { ahead: number; behind: number; files: string[]; totalFiles: number; syncRepoPath: string };
}

interface CountdownMessage {
  type: 'countdown';
  data: { seconds: number };
}

interface AutoRetryStatusMessage {
  type: 'autoRetryStatus';
  data: { running: boolean; retryCount: number; connectionCount?: number };
}

interface AutoRetryLogMessage {
  type: 'autoRetryLog';
  data: { message: string; logType: 'success' | 'error' | 'info' };
}

interface CDPStatusMessage {
  type: 'cdpStatus';
  data: { available: boolean; hasFlag: boolean; port: number };
}

type ExtensionMessage = ConfiguredMessage | StatusMessage | ErrorMessage | ConfigErrorMessage | LogMessage | ClearLogMessage | GitStatusMessage | CountdownMessage | AutoRetryStatusMessage | AutoRetryLogMessage | CDPStatusMessage;

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'configured':
      showConfigured(message.data.configured, message.data.repoUrl, message.data.syncFolders);
      break;
    case 'updateStatus':
      updateStatus(message.data.status, message.data.lastSync);
      break;
    case 'showError':
      showError(message.data.message);
      break;
    case 'configError':
      showConfigError(message.data.message);
      break;
    case 'log':
      appendLog(message.data.message, message.data.logType);
      break;
    case 'clearLog':
      clearLog();
      break;
    case 'gitStatus':
      updateGitStatus(message.data);
      break;
    case 'countdown':
      updateCountdown(message.data.seconds);
      break;
    case 'autoRetryStatus':
      updateAutoRetryStatus(message.data.running, message.data.retryCount, message.data.connectionCount);
      break;
    case 'autoRetryLog':
      appendAutoRetryLog(message.data.message, message.data.logType);
      break;
    case 'cdpStatus':
      updateCDPStatus(message.data.available, message.data.hasFlag, message.data.port);
      break;
  }
});
