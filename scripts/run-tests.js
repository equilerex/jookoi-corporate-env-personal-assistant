#!/usr/bin/env node
/**
 * Cross-platform test runner for jookoi-md-mcp.
 * On Windows, runs pytest inside WSL Ubuntu where the Linux Python environment resides.
 * On macOS and Linux, runs pytest from the local Python environment.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const rootDir = path.resolve(__dirname, '..');
const mcpDir = path.join(rootDir, 'jookoi-md-mcp');
const args = process.argv.slice(2);

if (isWin) {
  // Convert Windows path to WSL /mnt/...
  const drive = mcpDir.charAt(0).toLowerCase();
  const rest = mcpDir.slice(2).replace(/\\/g, '/');
  const wslPath = `/mnt/${drive}${rest}`;
  const pytestArgs = args.length > 0 ? args.join(' ') : '';
  const pytestCmd = `cd '${wslPath}' && .venv/bin/pytest ${pytestArgs}`;
  
  const res = spawnSync('wsl.exe', ['-d', 'Ubuntu', 'bash', '-c', pytestCmd], {
    stdio: 'inherit'
  });
  process.exit(res.status ?? (res.error ? 1 : 0));
} else {
  const res = spawnSync(path.join(mcpDir, '.venv', 'bin', 'python'), ['-m', 'pytest', ...args], {
    cwd: mcpDir,
    stdio: 'inherit'
  });
  process.exit(res.status ?? (res.error ? 1 : 0));
}
