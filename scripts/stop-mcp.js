#!/usr/bin/env node
/**
 * Cross-platform script to stop any running jookoi-md-mcp server process.
 */
const { spawnSync } = require('child_process');

const isWin = process.platform === 'win32';

if (isWin) {
  console.log('Stopping jookoi-md-mcp in WSL Ubuntu...');
  const res = spawnSync('wsl.exe', ['-d', 'Ubuntu', 'bash', '-c', "pkill -f 'jookoi-md-mcp|jookoi_md_mcp' || true"], {
    stdio: 'inherit'
  });
  console.log('Server process stopped.');
} else {
  console.log('Stopping jookoi-md-mcp process...');
  const res = spawnSync('bash', ['-c', "pkill -f 'jookoi-md-mcp|jookoi_md_mcp' || true"], {
    stdio: 'inherit'
  });
  console.log('Server process stopped.');
}
