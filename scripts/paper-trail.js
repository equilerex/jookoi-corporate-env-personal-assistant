#!/usr/bin/env node
/**
 * Cross-platform forwarder for jookoi-paper-trail CLI.
 * Finds the user's global skill script at ~/.agents/skills/jookoi-paper-trail/scripts/jookoi-paper-trail.js
 */
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const scriptPath = path.join(os.homedir(), '.agents', 'skills', 'jookoi-paper-trail', 'scripts', 'jookoi-paper-trail.js');

if (!fs.existsSync(scriptPath)) {
  console.error(`Error: jookoi-paper-trail script not found at ${scriptPath}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
process.exit(result.status ?? (result.error ? 1 : 0));
