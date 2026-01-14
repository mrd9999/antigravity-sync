/**
 * FilterService Unit Tests
 */
import { FilterService } from '../../services/FilterService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');

describe('FilterService', () => {
  const mockGeminiPath = '/Users/test/.gemini';
  let filterService: FilterService;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    filterService = new FilterService(mockGeminiPath);
  });

  describe('shouldIgnore', () => {
    it('should ignore oauth credentials', () => {
      expect(filterService.shouldIgnore('oauth_creds.json')).toBe(true);
      expect(filterService.shouldIgnore('google_accounts.json')).toBe(true);
    });

    it('should ignore browser recordings directory', () => {
      expect(filterService.shouldIgnore('browser_recordings/video.webm')).toBe(true);
    });

    it('should allow .pb files (conversations)', () => {
      expect(filterService.shouldIgnore('conversations/123.pb')).toBe(false);
    });

    it('should ignore .DS_Store', () => {
      expect(filterService.shouldIgnore('.DS_Store')).toBe(true);
    });

    it('should not ignore knowledge files', () => {
      expect(filterService.shouldIgnore('knowledge/my-item/overview.md')).toBe(false);
    });

    it('should not ignore antigravity files', () => {
      expect(filterService.shouldIgnore('antigravity/settings.json')).toBe(false);
    });
  });

  describe('filterFiles', () => {
    it('should filter out ignored files', () => {
      const files = [
        'knowledge/item1/overview.md',
        'oauth_creds.json',
        'antigravity/config.json',
        'browser_recordings/session.webm'
      ];

      const filtered = filterService.filterFiles(files);

      expect(filtered).toEqual([
        'knowledge/item1/overview.md',
        'antigravity/config.json'
      ]);
    });

    it('should return empty array if all files ignored', () => {
      const files = ['oauth_creds.json', 'google_accounts.json'];
      const filtered = filterService.filterFiles(files);
      expect(filtered).toEqual([]);
    });
  });

  describe('getDefaultExcludes', () => {
    it('should return default exclude patterns', () => {
      const excludes = FilterService.getDefaultExcludes();
      expect(excludes).toContain('google_accounts.json');
      expect(excludes).toContain('oauth_creds.json');
      expect(excludes).toContain('**/browser_recordings/**');
    });
  });

  describe('custom patterns', () => {
    it('should respect custom exclude patterns', () => {
      const customFilter = new FilterService(mockGeminiPath, ['*.tmp', 'drafts/']);
      expect(customFilter.shouldIgnore('file.tmp')).toBe(true);
      expect(customFilter.shouldIgnore('drafts/doc.md')).toBe(true);
    });
  });
});
