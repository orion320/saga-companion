#!/usr/bin/env node

/**
 * Build script — produces browser-specific extension bundles.
 *
 * Usage:
 *   node scripts/build.js chrome    → dist/chrome/
 *   node scripts/build.js firefox   → dist/firefox/
 *   node scripts/build.js safari    → dist/safari/
 *   node scripts/build.js all       → all three
 *
 * Each build copies src/ to dist/{browser}/ and transforms the manifest
 * for that browser's requirements.
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const target = process.argv[2] || 'chrome';
const targets = target === 'all' ? ['chrome', 'firefox', 'safari'] : [target];

for (const browser of targets) {
  console.log(`Building for ${browser}...`);

  const out = join(DIST, browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Copy all source files
  cpSync(SRC, out, { recursive: true });

  // Read and transform manifest
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));

  if (browser === 'firefox') {
    // Firefox uses sidebar_action instead of side_panel
    delete manifest.side_panel;
    manifest.sidebar_action = {
      default_panel: 'sidepanel/index.html',
      default_title: 'Saga Companion',
      default_icon: 'assets/icons/icon-48.png',
      open_at_install: false,
    };

    // Firefox MV3 supports background scripts alongside service workers
    manifest.background = {
      scripts: ['background/service-worker.js'],
      type: 'module',
    };

    // Remove Chrome-only permissions
    manifest.permissions = manifest.permissions.filter(p => p !== 'sidePanel');
    manifest.optional_permissions = manifest.optional_permissions.filter(p => p !== 'offscreen');

    // Firefox requires browser_specific_settings
    manifest.browser_specific_settings = {
      gecko: {
        id: 'companion@saga.so',
        strict_min_version: '109.0',
      },
    };
  }

  if (browser === 'safari') {
    // Safari has no side_panel or sidebar_action
    delete manifest.side_panel;

    // Remove unsupported permissions
    manifest.permissions = manifest.permissions.filter(p =>
      !['sidePanel', 'tabCapture', 'offscreen'].includes(p)
    );
    delete manifest.optional_permissions;
  }

  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`  → dist/${browser}/`);
}

console.log('Done.');
