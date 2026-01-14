/**
 * ConfigService Unit Tests
 */
import { ConfigService, SyncConfig } from '../../services/ConfigService';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn()
  },
  ConfigurationTarget: {
    Global: 1
  }
}), { virtual: true });

describe('ConfigService', () => {
  let configService: ConfigService;
  let mockContext: any;
  let mockSecrets: any;
  let mockConfig: any;

  beforeEach(() => {
    mockSecrets = {
      store: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    };

    mockContext = {
      secrets: mockSecrets
    };

    mockConfig = {
      get: jest.fn((key: string, defaultValue: any) => defaultValue),
      update: jest.fn().mockResolvedValue(undefined)
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

    configService = new ConfigService(mockContext);
  });

  describe('getConfig', () => {
    it('should return default config values', () => {
      const config = configService.getConfig();

      expect(config.autoSync).toBe(true);
      expect(config.syncIntervalMinutes).toBe(5);
      expect(config.excludePatterns).toEqual([]);
    });

    it('should use custom values when configured', () => {
      mockConfig.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'autoSync') return false;
        if (key === 'syncIntervalMinutes') return 10;
        return defaultValue;
      });

      const config = configService.getConfig();

      expect(config.autoSync).toBe(false);
      expect(config.syncIntervalMinutes).toBe(10);
    });
  });

  describe('isConfigured', () => {
    it('should return false when not configured', async () => {
      const result = await configService.isConfigured();
      expect(result).toBe(false);
    });

    it('should return true when both repo and PAT are set', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'repositoryUrl') return 'https://github.com/user/repo';
        return '';
      });
      mockSecrets.get.mockResolvedValue('ghp_token');

      const result = await configService.isConfigured();
      expect(result).toBe(true);
    });
  });

  describe('parseRepositoryUrl', () => {
    it('should parse HTTPS URL', () => {
      const result = configService.parseRepositoryUrl('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse HTTPS URL with .git', () => {
      const result = configService.parseRepositoryUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse SSH URL', () => {
      const result = configService.parseRepositoryUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should return null for invalid URL', () => {
      const result = configService.parseRepositoryUrl('invalid-url');
      expect(result).toBeNull();
    });
  });

  describe('credentials', () => {
    it('should save credentials securely', async () => {
      await configService.saveCredentials('ghp_test_token');
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'antigravitySync.gitToken',
        'ghp_test_token'
      );
    });

    it('should retrieve credentials', async () => {
      mockSecrets.get.mockResolvedValue('ghp_stored_token');
      const result = await configService.getCredentials();
      expect(result).toBe('ghp_stored_token');
    });

    it('should delete credentials', async () => {
      await configService.deleteCredentials();
      expect(mockSecrets.delete).toHaveBeenCalledWith('antigravitySync.gitToken');
    });
  });
});
