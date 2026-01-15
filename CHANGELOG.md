# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-01-15

### Added
- Git Credential Manager integration for persistent credential storage
- Per-repository credential support (no conflicts with multiple GitHub accounts)
- Cross-platform credential storage (macOS Keychain, Windows Credential Manager, Linux libsecret/GNOME Keyring)
- Automatic credential helper configuration

### Changed
- Credentials now stored via Git credential manager instead of VS Code secret storage
- Credentials persist across all workspaces and VS Code installations
- No need to re-enter credentials when switching workspaces

### Security
- Credentials stored in OS-native secure storage
- Per-repository isolation prevents credential conflicts
- Backwards compatible with existing host-level credentials

## [0.1.0] - 2026-01-13

### Added
- Initial release
- Side panel with sync status, files, and history
- Setup wizard for easy configuration
- Private repository validation (rejects public repos)
- Auto-sync with configurable interval
- Selective folder sync
- Sensitive data exclusion (OAuth tokens, credentials)
- Status bar indicator
- Push/Pull/Sync commands
- Unit tests and E2E tests
- GitHub Actions CI/CD

### Security
- PAT stored in VS Code secret storage
- Automatic exclusion of sensitive files
- Private repository enforcement
