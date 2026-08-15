import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = (file: string) => resolve(process.cwd(), 'dist', file);

describe('extension build output', () => {
  it('emits content.js, background.js and manifest.json', () => {
    expect(existsSync(dist('content.js'))).toBe(true);
    expect(existsSync(dist('background.js'))).toBe(true);
    expect(existsSync(dist('manifest.json'))).toBe(true);
  });

  it('emits a content script free of ES module syntax', () => {
    // MV3 content scripts are classic scripts. A stray import/export makes
    // Chromium refuse to inject them, with no useful error in the console.
    const code = readFileSync(dist('content.js'), 'utf8');
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/^\s*export\s/m);
  });

  it('declares manifest v3 and the lrclib host permission', () => {
    const manifest = JSON.parse(readFileSync(dist('manifest.json'), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toContain('https://lrclib.net/*');
    expect(manifest.background.service_worker).toBe('background.js');
  });
});
