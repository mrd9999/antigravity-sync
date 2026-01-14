# Antigravity Sync

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/antigravity-sync.antigravity-sync.svg)](https://marketplace.visualstudio.com/items?itemName=antigravity-sync.antigravity-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

VS Code Extension đồng bộ **Gemini Antigravity context** (`~/.gemini/antigravity/`) giữa các máy thông qua private Git repository.

**Vấn đề:** Khi switch máy, toàn bộ conversation history, Knowledge Items và brain artifacts của Gemini Antigravity bị mất. Extension này sync tự động qua Git để giải quyết vấn đề đó.

![Antigravity Sync Panel](docs/images/panel-preview.png)

## Features

- **Auto-sync** — Tự động sync changes lên private repository
- **Private repo only** — Validate repository phải là private
- **Sensitive data protection** — Auto-exclude OAuth tokens và credentials
- **Side panel** — Dashboard hiển thị sync status, files và history
- **Selective sync** — Chọn folders cần sync
- **Setup wizard** — Config step-by-step

## Installation

### Từ VS Code Marketplace

1. Mở VS Code
2. Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search "Antigravity Sync"
4. Install

### Từ VSIX

```bash
code --install-extension antigravity-sync-0.1.0.vsix
```

## Quick Start

1. Tạo **private Git repository** (GitHub, GitLab, Bitbucket)
2. Generate **access token** với repo scope
   - GitHub: [github.com/settings/tokens](https://github.com/settings/tokens)
   - GitLab: Settings → Access Tokens
   - Bitbucket: App passwords
3. Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Run `Antigravity Sync: Configure Repository`
5. Follow setup wizard

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `antigravitySync.repositoryUrl` | `""` | Git repository URL (phải private) |
| `antigravitySync.autoSync` | `true` | Auto sync changes |
| `antigravitySync.syncIntervalMinutes` | `5` | Auto-sync interval (phút) |
| `antigravitySync.syncFolders` | `["knowledge", "antigravity"]` | Folders cần sync |
| `antigravitySync.excludePatterns` | `[]` | Additional exclude patterns |
| `antigravitySync.geminiPath` | `""` | Custom path tới .gemini |

## Excluded Files (Default)

Các files sau **không bao giờ sync** để protect privacy:

| Pattern | Reason |
|---------|--------|
| `google_accounts.json` | OAuth credentials |
| `oauth_creds.json` | OAuth credentials |
| `browser_recordings/` | Large video files |
| `code_tracker/` | Machine-specific data |
| `implicit/` | Workspace indexing |
| `user_settings.pb` | User preferences |

> **Note**: `conversations/*.pb` ĐƯỢC sync (chat history).

Custom patterns có thể add trong `.antigravityignore` tại `.gemini/antigravity`.

## Commands

| Command | Description |
|---------|-------------|
| `Antigravity Sync: Configure Repository` | Setup hoặc change repository |
| `Antigravity Sync: Sync Now` | Manual sync (push + pull) |
| `Antigravity Sync: Push Changes` | Push local changes only |
| `Antigravity Sync: Pull Changes` | Pull remote changes only |
| `Antigravity Sync: Show Status` | Show sync status |

## Security

> ⚠️ Extension yêu cầu Git access token với repo scope.

- Token lưu trong VS Code Secret Storage
- Chỉ work với **private repositories**
- Sensitive files auto-excluded
- HTTPS only

## Cross-Machine Sync

Sau khi sync sang máy mới, Gemini cần matching workspace paths để recognize conversations.

### Step 1: Pull synced data
Install extension, connect cùng repo, **Pull** để get all data.

### Step 2: Create symlinks cho workspace paths
Gemini bind conversations với workspace paths. Tạo symlinks trên máy mới:

```bash
# Example: Máy cũ có workspace tại /Users/dung.leviet/Documents/core
# Trên máy mới (Linux/Mac):
sudo mkdir -p /Users/dung.leviet/Documents
sudo ln -s /actual/path/to/project /Users/dung.leviet/Documents/core

# Windows (Run as Admin):
mklink /D "C:\Users\dung.leviet\Documents\core" "D:\actual\path\to\project"
```

### Cross-machine compatibility:

| Folder | Compatibility |
|--------|---------------|
| `knowledge/` | ✅ Works ngay (global) |
| `brain/` | ✅ Artifacts readable |
| `conversations/` | ⚠️ Cần symlink match paths |

### OS Compatibility (cho conversations):

| Sync between | Works? | Notes |
|--------------|--------|-------|
| macOS ↔ macOS | ✅ | symlink |
| Linux ↔ Linux | ✅ | symlink |
| Windows ↔ Windows | ✅ | `mklink /D` (Admin) |
| macOS ↔ Linux | ✅ | symlink |
| macOS/Linux ↔ Windows WSL | ✅ | symlink in WSL + VS Code Remote |
| macOS/Linux ↔ Windows native | ❌ | Path format incompatible |

> **Note:** Knowledge Items work trên all platforms không cần symlinks.

## Development

```bash
git clone https://github.com/mrd9999/antigravity-sync.git
cd antigravity-sync
yarn install
yarn build
yarn test

# Run extension (dev mode)
code . && press F5
```

## Contributing

- [Report bugs](https://github.com/mrd9999/antigravity-sync/issues/new?template=bug_report.md)
- [Request features](https://github.com/mrd9999/antigravity-sync/issues/new?template=feature_request.md)
- [Improve docs](https://github.com/mrd9999/antigravity-sync/pulls)

## License

MIT © [Dung Le](https://www.facebook.com/mrd.900s)

---

## Contact

- Facebook: [@mrd.900s](https://www.facebook.com/mrd.900s)
- GitHub: [Issues](https://github.com/mrd9999/antigravity-sync/issues)
