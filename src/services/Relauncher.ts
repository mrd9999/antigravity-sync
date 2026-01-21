/**
 * Relauncher - Setup CDP flag for IDE startup
 * Helps users configure their IDE to launch with --remote-debugging-port
 */
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_PORT = 31905;

export type RelaunchStatus = 'MODIFIED' | 'READY' | 'FAILED' | 'NOT_FOUND';
export type RelauncherLogCallback = (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;

export class Relauncher {
  private platform: NodeJS.Platform;
  private logCallback?: RelauncherLogCallback;
  private cdpPort: number;

  constructor() {
    this.platform = os.platform();
    const config = vscode.workspace.getConfiguration('antigravitySync');
    this.cdpPort = config.get('cdpPort', DEFAULT_PORT);
  }

  setLogCallback(callback: RelauncherLogCallback): void {
    this.logCallback = callback;
  }

  private log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
    console.log(`[Relauncher] ${message}`);
    this.logCallback?.(message, type);
  }

  getIdeName(): string {
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('cursor')) return 'Cursor';
    if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
    return 'VS Code';
  }

  getCDPPort(): number {
    return this.cdpPort;
  }

  getCDPFlag(): string {
    return `--remote-debugging-port=${this.cdpPort}`;
  }

  checkCurrentProcessHasFlag(): boolean {
    return process.argv.join(' ').includes(`--remote-debugging-port=${this.cdpPort}`);
  }

  /**
   * Main entry point: setup CDP and show instructions
   */
  async ensureCDPAndPrompt(): Promise<{ success: boolean; relaunched: boolean }> {
    if (this.checkCurrentProcessHasFlag()) {
      this.log('CDP flag already present.', 'success');
      return { success: true, relaunched: false };
    }

    this.log('Setting up CDP...', 'info');
    const status = await this.modifyShortcut();

    if (status === 'MODIFIED' || status === 'READY') {
      await this.showSetupDialog();
      return { success: true, relaunched: false };
    }

    this.showManualInstructions();
    return { success: false, relaunched: false };
  }

  /**
   * Show setup complete dialog with platform-specific instructions
   */
  private async showSetupDialog(): Promise<void> {
    const ideName = this.getIdeName();

    if (this.platform === 'darwin') {
      await this.showMacOSDialog(ideName);
    } else if (this.platform === 'win32') {
      await this.showWindowsDialog(ideName);
    } else {
      await this.showLinuxDialog(ideName);
    }
  }

  /**
   * macOS: Show dialog with Terminal and Finder options
   */
  private async showMacOSDialog(ideName: string): Promise<void> {
    const command = `~/.local/bin/${ideName.toLowerCase()}-cdp`;

    const choice = await vscode.window.showWarningMessage(
      `✅ CDP Setup Complete!\n\n` +
      `📌 NEXT STEPS:\n` +
      `1. Press Cmd+Q to QUIT ${ideName}\n` +
      `2. Open Terminal app (in /Applications/Utilities/)\n` +
      `3. Paste the command and press Enter\n\n` +
      `Or use the wrapper app in ~/Applications folder.`,
      { modal: true },
      '📋 Copy Command',
      '📁 Open Folder'
    );

    if (choice === '📋 Copy Command') {
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `✅ Command copied!\n\n` +
        `Now: Cmd+Q → Open Terminal → Paste (Cmd+V) → Enter`
      );
    } else if (choice === '📁 Open Folder') {
      const { exec } = require('child_process');
      const folderPath = path.join(os.homedir(), 'Applications');
      exec(`open "${folderPath}"`);
      vscode.window.showInformationMessage(
        `✅ Folder opened!\n\n` +
        `Now: Cmd+Q → Double-click "${ideName}CDP" in the folder`
      );
    }
  }

  /**
   * Windows: Show dialog with CMD/PowerShell instructions
   */
  private async showWindowsDialog(ideName: string): Promise<void> {
    const command = this.getLaunchCommand();

    const choice = await vscode.window.showWarningMessage(
      `✅ CDP Setup Complete!\n\n` +
      `📌 NEXT STEPS (choose one):\n\n` +
      `Option A - Use Updated Shortcut:\n` +
      `1. Close ${ideName} (File → Exit)\n` +
      `2. Reopen from Desktop or Start Menu\n\n` +
      `Option B - Use Command:\n` +
      `1. Close ${ideName}\n` +
      `2. Open CMD or PowerShell\n` +
      `3. Paste the command and press Enter`,
      { modal: true },
      '📋 Copy Command'
    );

    if (choice === '📋 Copy Command') {
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `✅ Command copied!\n\n` +
        `Now: Close ${ideName} → Open CMD/PowerShell → Right-click to Paste → Enter`
      );
    }
  }

  /**
   * Linux: Show dialog with Terminal instructions
   */
  private async showLinuxDialog(ideName: string): Promise<void> {
    const command = this.getLaunchCommand();

    const choice = await vscode.window.showWarningMessage(
      `✅ CDP Setup Complete!\n\n` +
      `📌 NEXT STEPS (choose one):\n\n` +
      `Option A - Use Updated Launcher:\n` +
      `1. Close ${ideName}\n` +
      `2. Reopen from Application Menu\n\n` +
      `Option B - Use Terminal:\n` +
      `1. Close ${ideName}\n` +
      `2. Open Terminal\n` +
      `3. Paste the command and press Enter`,
      { modal: true },
      '📋 Copy Command'
    );

    if (choice === '📋 Copy Command') {
      await vscode.env.clipboard.writeText(command);
      vscode.window.showInformationMessage(
        `✅ Command copied!\n\n` +
        `Now: Close ${ideName} → Open Terminal → Paste (Ctrl+Shift+V) → Enter`
      );
    }
  }

  /**
   * Get launch command for current platform
   */
  private getLaunchCommand(): string {
    const ideName = this.getIdeName();
    const port = this.cdpPort;

    if (this.platform === 'darwin') {
      return `~/.local/bin/${ideName.toLowerCase()}-cdp`;
    } else if (this.platform === 'win32') {
      const exe = this.findExecutable();
      return `"${exe}" --remote-debugging-port=${port}`;
    } else {
      const exe = this.findExecutable();
      return `${exe} --remote-debugging-port=${port}`;
    }
  }

  /**
   * Find executable path for current platform
   */
  private findExecutable(): string {
    const ideName = this.getIdeName();

    if (this.platform === 'win32') {
      const paths = [
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'cursor', 'Cursor.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Antigravity', 'Antigravity.exe'),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
      return `C:\\Path\\To\\${ideName}.exe`;
    } else {
      const paths = [
        '/usr/bin/code',
        '/usr/bin/cursor',
        '/usr/bin/antigravity',
        path.join(os.homedir(), '.local/share/code/code'),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
      return ideName.toLowerCase();
    }
  }

  /**
   * Show manual instructions
   */
  showManualInstructions(): void {
    const ideName = this.getIdeName();
    const command = this.getLaunchCommand();

    vscode.window.showInformationMessage(
      `📖 To enable Auto Retry:\n\n` +
      `1. Close ${ideName}\n` +
      `2. Run: ${command}\n\n` +
      `Or add --remote-debugging-port=${this.cdpPort} to your shortcut.`,
      'Copy Command'
    ).then(choice => {
      if (choice === 'Copy Command') {
        vscode.env.clipboard.writeText(command);
        vscode.window.showInformationMessage('✅ Command copied!');
      }
    });
  }

  /**
   * Modify shortcut/wrapper for current platform
   */
  async modifyShortcut(): Promise<RelaunchStatus> {
    try {
      if (this.platform === 'darwin') {
        return this.createMacOSWrapper() ? 'MODIFIED' : 'FAILED';
      } else if (this.platform === 'win32') {
        return this.modifyWindowsShortcut();
      } else {
        return this.modifyLinuxDesktop() ? 'MODIFIED' : 'FAILED';
      }
    } catch (e: any) {
      this.log(`Error: ${e.message}`, 'error');
      return 'FAILED';
    }
  }

  /**
   * macOS: Create wrapper script
   */
  private createMacOSWrapper(): boolean {
    const ideName = this.getIdeName();
    const binDir = path.join(os.homedir(), '.local', 'bin');

    try {
      fs.mkdirSync(binDir, { recursive: true });

      // Find app
      const locations = ['/Applications', path.join(os.homedir(), 'Applications')];
      const appNames = [`${ideName}.app`, 'Cursor.app', 'Visual Studio Code.app', 'Antigravity.app'];
      let appPath = '';

      for (const loc of locations) {
        for (const name of appNames) {
          const p = path.join(loc, name);
          if (fs.existsSync(p)) { appPath = p; break; }
        }
        if (appPath) break;
      }

      if (!appPath) return false;

      const wrapperPath = path.join(binDir, `${ideName.toLowerCase()}-cdp`);
      const content = `#!/bin/bash\nopen -a "${appPath}" --args --remote-debugging-port=${this.cdpPort} "$@"`;
      fs.writeFileSync(wrapperPath, content, { mode: 0o755 });

      this.log(`Created wrapper: ${wrapperPath}`, 'success');
      return true;
    } catch (e: any) {
      this.log(`Failed: ${e.message}`, 'error');
      return false;
    }
  }

  /**
   * Windows: Modify shortcuts using PowerShell
   */
  private modifyWindowsShortcut(): RelaunchStatus {
    const ideName = this.getIdeName();
    const port = this.cdpPort;
    const { execSync } = require('child_process');

    const script = `
$WshShell = New-Object -ComObject WScript.Shell
$folders = @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Programs"))
$modified = $false

foreach ($folder in $folders) {
  if (Test-Path $folder) {
    Get-ChildItem -Path $folder -Filter "*${ideName}*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      $shortcut = $WshShell.CreateShortcut($_.FullName)
      if ($shortcut.Arguments -notlike "*--remote-debugging-port=${port}*") {
        $shortcut.Arguments = "--remote-debugging-port=${port} " + $shortcut.Arguments
        $shortcut.Save()
        $modified = $true
      }
    }
  }
}

if ($modified) { "MODIFIED" } else { "READY" }
`;

    try {
      const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        timeout: 10000
      }).trim();

      return result.includes('MODIFIED') ? 'MODIFIED' : 'READY';
    } catch {
      return 'FAILED';
    }
  }

  /**
   * Linux: Modify .desktop file
   */
  private modifyLinuxDesktop(): boolean {
    const ideName = this.getIdeName().toLowerCase();
    const port = this.cdpPort;
    const desktopDir = path.join(os.homedir(), '.local', 'share', 'applications');

    try {
      fs.mkdirSync(desktopDir, { recursive: true });

      const searchDirs = [desktopDir, '/usr/share/applications'];

      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir).filter(f =>
          f.endsWith('.desktop') && (f.includes(ideName) || f.includes('code') || f.includes('cursor'))
        );

        for (const file of files) {
          let content = fs.readFileSync(path.join(dir, file), 'utf8');

          if (!content.includes(`--remote-debugging-port=${port}`)) {
            content = content.replace(/^Exec=(.*)$/m, `Exec=$1 --remote-debugging-port=${port}`);
            fs.writeFileSync(path.join(desktopDir, file), content);
            this.log(`Modified: ${file}`, 'success');
            return true;
          }
        }
      }

      return false;
    } catch (e: any) {
      this.log(`Failed: ${e.message}`, 'error');
      return false;
    }
  }
}
