# Antigravity Sync - Retry

> 🇬🇧 **English users:** See [README in English](README.md) for English documentation.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/mrd9999.antigravity-sync.svg)](https://marketplace.visualstudio.com/items?itemName=mrd9999.antigravity-sync)
[![Open VSX](https://img.shields.io/open-vsx/v/mrd9999/antigravity-sync)](https://open-vsx.org/extension/mrd9999/antigravity-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Tự động đồng bộ context AI + Tự động retry khi AI gặp lỗi. Tự động hóa không cần trông chừng!**

---

## 👤 Về Tác Giả

**Dung Le** — Software Engineer từ Việt Nam 🇻🇳

- 💼 **Facebook:** [@mrd.900s](https://www.facebook.com/mrd.900s)
- 🐙 **GitHub:** [mrd9999](https://github.com/mrd9999)
- 🐧 **VNLF:** [Vietnam Linux Family](https://www.facebook.com/groups/vietnamlinuxcommunity)

---

## Ảnh Chụp Màn Hình

| Auto Retry | Sync Dashboard |
|:-----------:|:--------------:|
| ![Auto Retry](resources/screenshot.png) | ![Sync](docs/images/panel-preview.png) |

---

## 🤖 Auto Retry

Tự động click nút **Retry** khi AI agent gặp lỗi. Không cần ngồi canh màn hình!

### Cách Hoạt Động

Sử dụng Chrome DevTools Protocol (CDP) để inject script giám sát IDE webview và tự động click các nút retry.

### Bắt Đầu Nhanh

1. Mở panel **Antigravity Sync** trong sidebar
2. Click **"Start Auto Retry"**
3. Lần đầu: Làm theo hướng dẫn setup CDP
4. **Khởi động lại IDE** (Quit + Mở lại bằng command được hiển thị)
5. Click **"Start Auto Retry"** lần nữa → Hoạt động! ✅

### IDE Được Hỗ Trợ

- ✅ VS Code
- ✅ Cursor  
- ✅ Antigravity
- ✅ Các IDE dựa trên Electron khác

### Hỗ Trợ Nền Tảng

| Nền tảng | Trạng thái |
|----------|-----------|
| macOS | ✅ Hỗ trợ đầy đủ |
| Windows | ✅ Hỗ trợ đầy đủ |
| Linux | ✅ Hỗ trợ đầy đủ |

---

## 🔄 Auto Sync

Đồng bộ **Gemini Antigravity context** (`~/.gemini/antigravity/`) giữa các máy thông qua Git repository riêng tư.

**Vấn đề được giải quyết:** Khi chuyển máy, tất cả lịch sử hội thoại, Knowledge Items và brain artifacts bị mất. Extension này tự động đồng bộ qua Git để bảo toàn mọi thứ.

---

## ⚠️ QUAN TRỌNG: Đồng Bộ Giữa Các Máy

### Khớp Đường Dẫn Workspace

Antigravity lưu lịch sử hội thoại theo **đường dẫn tuyệt đối của workspace**. Để xem hội thoại từ máy cũ trên máy mới, **đường dẫn workspace PHẢI GIỐNG HỆT NHAU**.

**Ví dụ:**
- Máy A: `/Users/dung.leviet/Documents/myproject`
- Máy B: **PHẢI là** `/Users/dung.leviet/Documents/myproject`

Nếu đường dẫn khác nhau, hội thoại sẽ không hiển thị dù đã sync thành công.

### Giải Pháp: Symlinks

Tạo symlinks trên máy mới để khớp đường dẫn máy cũ:

```bash
# Linux/macOS
sudo mkdir -p /Users/dung.leviet/Documents
sudo ln -s /duong/dan/thuc/te /Users/dung.leviet/Documents/myproject

# Windows (Chạy với quyền Administrator)
mklink /D "C:\Users\dung.leviet\Documents\myproject" "D:\duong\dan\thuc\te"
```

### Reload Window Sau Khi Sync

Sau khi pull dữ liệu từ remote, bạn **PHẢI reload VS Code window** để load hội thoại mới:

```
Cmd+Shift+P (macOS) / Ctrl+Shift+P (Windows/Linux)
→ "Developer: Reload Window"
```

### Tương Thích Hệ Điều Hành

| Đồng bộ giữa | Hoạt động? | Ghi chú |
|--------------|-----------|---------|
| macOS ↔ macOS | ✅ | Dùng symlink |
| Linux ↔ Linux | ✅ | Dùng symlink |
| Windows ↔ Windows | ✅ | Dùng `mklink /D` (Admin) |
| macOS ↔ Linux | ✅ | Dùng symlink |
| macOS/Linux ↔ Windows WSL | ✅ | Symlink trong WSL + VS Code Remote |
| **macOS/Linux ↔ Windows native** | ❌ | **Định dạng path không tương thích** |

> **Lưu ý:** 
> - `knowledge/` và `brain/` hoạt động trên mọi nền tảng mà không cần symlink
> - Chỉ `conversations/` cần khớp đường dẫn workspace

---

## Tính Năng

- **Tự động đồng bộ** — Tự động sync thay đổi lên repo riêng tư
- **Chỉ repo riêng tư** — Chỉ chấp nhận repository private
- **Bảo vệ dữ liệu nhạy cảm** — Tự động loại trừ OAuth tokens và credentials
- **Side panel** — Dashboard hiển thị trạng thái sync, files và lịch sử
- **Đồng bộ chọn lọc** — Chọn thư mục cần sync
- **Hướng dẫn setup** — Cấu hình từng bước

## Cài Đặt

### Từ Marketplace

**VS Code Marketplace:**
https://marketplace.visualstudio.com/items?itemName=mrd9999.antigravity-sync

**Open VSX (cho Cursor, VSCodium):**
https://open-vsx.org/extension/mrd9999/antigravity-sync

### Từ VS Code/Antigravity

1. Mở Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
2. Tìm "Antigravity Sync"
3. Cài đặt

### Từ VSIX

```bash
# Nếu agy đã có trong PATH:
agy --install-extension antigravity-sync-0.1.1.vsix

# Nếu agy CHƯA có trong PATH, thêm trước:
# Cmd+Shift+P → "Shell Command: Install 'agy' command in PATH"
# Sau đó chạy lệnh install ở trên
```

## Bắt Đầu Nhanh (Sync)

1. Tạo **private Git repository** (GitHub, GitLab, Bitbucket)
2. Tạo **access token** với quyền repo
   - GitHub: [github.com/settings/tokens](https://github.com/settings/tokens)
   - GitLab: Settings → Access Tokens
   - Bitbucket: App passwords
3. Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Chạy `Antigravity Sync: Configure Repository`
5. Làm theo hướng dẫn

## Cấu Hình

| Setting | Mặc định | Mô tả |
|---------|----------|-------|
| `antigravitySync.repositoryUrl` | `""` | URL Git repository (phải là private) |
| `antigravitySync.autoSync` | `true` | Tự động sync thay đổi |
| `antigravitySync.syncIntervalMinutes` | `5` | Khoảng thời gian auto-sync (phút) |
| `antigravitySync.syncFolders` | `["knowledge", "antigravity"]` | Thư mục cần sync |
| `antigravitySync.excludePatterns` | `[]` | Patterns loại trừ thêm |
| `antigravitySync.geminiPath` | `""` | Đường dẫn tùy chỉnh đến .gemini |

## Files Bị Loại Trừ (Mặc Định)

Các files sau **không bao giờ được sync** để bảo vệ quyền riêng tư:

| Pattern | Lý do |
|---------|-------|
| `google_accounts.json` | OAuth credentials |
| `oauth_creds.json` | OAuth credentials |
| `browser_recordings/` | File video lớn |
| `code_tracker/` | Dữ liệu riêng của máy |
| `implicit/` | Workspace indexing |
| `user_settings.pb` | Preferences người dùng |

> **Lưu ý**: `conversations/*.pb` VẪN được sync (lịch sử chat).

Có thể thêm patterns tùy chỉnh trong `.antigravityignore` tại `.gemini/antigravity`.

## Commands

| Command | Mô tả |
|---------|-------|
| `Antigravity Sync: Configure Repository` | Setup hoặc thay đổi repository |
| `Antigravity Sync: Sync Now` | Sync thủ công (push + pull) |
| `Antigravity Sync: Push Changes` | Chỉ push thay đổi local |
| `Antigravity Sync: Pull Changes` | Chỉ pull thay đổi remote |
| `Antigravity Sync: Show Status` | Hiển thị trạng thái sync |

## Bảo Mật

> ⚠️ Extension yêu cầu Git access token với quyền repo.

- Token được lưu trong VS Code Secret Storage
- Chỉ hoạt động với **private repositories**
- Files nhạy cảm được tự động loại trừ
- Chỉ hỗ trợ HTTPS

## Phát Triển

```bash
git clone https://github.com/mrd9999/antigravity-sync.git
cd antigravity-sync
yarn install
yarn build
yarn test

# Chạy extension (dev mode)
agy . && bấm F5
```

## Đóng Góp

- [Báo lỗi](https://github.com/mrd9999/antigravity-sync/issues/new?template=bug_report.md)
- [Yêu cầu tính năng](https://github.com/mrd9999/antigravity-sync/issues/new?template=feature_request.md)
- [Cải thiện docs](https://github.com/mrd9999/antigravity-sync/pulls)

## License

MIT © [Dung Le](https://www.facebook.com/mrd.900s)

---

## Liên Hệ

- Facebook: [@mrd.900s](https://www.facebook.com/mrd.900s)
- GitHub: [Issues](https://github.com/mrd9999/antigravity-sync/issues)
- VNLF: [Vietnam Linux Family](https://www.facebook.com/groups/vietnamlinuxcommunity)
