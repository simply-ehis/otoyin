/**
 * otoyin — Development Environment Setup
 *
 * Creates placeholder sidecar binaries and config for local development.
 * Run from the repository root: node scripts/setup-dev.js
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  [create] ${path.relative(REPO_ROOT, dir)}/`);
  }
}

function createPlaceholder(name) {
  const binariesDir = path.resolve(REPO_ROOT, 'tauri', 'src-tauri', 'binaries');
  ensureDir(binariesDir);

  const platform = process.platform;
  const arch = process.arch;

  let target;
  if (platform === 'win32') target = 'x86_64-pc-windows-msvc';
  else if (platform === 'darwin' && arch === 'arm64') target = 'aarch64-apple-darwin';
  else if (platform === 'darwin') target = 'x86_64-apple-darwin';
  else target = 'x86_64-unknown-linux-gnu';

  const ext = platform === 'win32' ? '.exe' : '';
  const binPath = path.join(binariesDir, `${name}-${target}${ext}`);

  if (fs.existsSync(binPath)) {
    console.log(`  [skip] ${path.relative(REPO_ROOT, binPath)} already exists`);
    return;
  }

  // Create a minimal placeholder script/binary
  if (platform === 'win32') {
    fs.writeFileSync(binPath, `@echo off\r\necho otoyin dev placeholder: ${name}\r\n`, 'utf8');
  } else {
    fs.writeFileSync(binPath, `#!/bin/sh\necho "otoyin dev placeholder: ${name}"\n`, 'utf8');
    fs.chmodSync(binPath, 0o755);
  }
  console.log(`  [create] ${path.relative(REPO_ROOT, binPath)}`);
}

console.log('\n21-labs — Development Setup\n');

// Ensure Tauri icons directory exists
ensureDir(path.resolve(REPO_ROOT, 'tauri', 'src-tauri', 'icons'));

// Create placeholder sidecar binaries for development
console.log('\n  Creating dev placeholder sidecar binaries...');
createPlaceholder('21labs-server');
createPlaceholder('21labs-mcp');

// Install git hooks so the pre-commit gate is active on every clone
console.log('\n  Installing pre-commit hook...');
try {
	const { execSync } = require('node:child_process');
	execSync('git config core.hooksPath .githooks', { cwd: REPO_ROOT, stdio: 'pipe' });
	const hookPath = execSync('git config --get core.hooksPath', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
	if (hookPath === '.githooks') {
		console.log('  [ok] git hooksPath -> .githooks (pre-commit gate active)');
	} else {
		console.log(`  [warn] git hooksPath is '${hookPath}' not '.githooks'`);
	}
} catch (e) {
	console.log(`  [warn] could not set git hooksPath: ${e.message}`);
	console.log('         run manually: git config core.hooksPath .githooks');
}

console.log('\nSetup complete. Run "just dev" or "cd tauri && bun tauri dev" to start.\n');
console.log('Verification: bun run lint && bun run typecheck   (frontend)');
console.log('              just check / bin/check.ps1           (full gate)\n');
