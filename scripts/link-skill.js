#!/usr/bin/env node
/**
 * Links jookoi-brain-mcp and jookoi-brain-api skills to the global ~/.agents/skills/ directory.
 * Works across Windows, macOS, and Linux.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const globalAgentsSkills = path.join(os.homedir(), '.agents', 'skills');
const skillsToLink = ['jookoi-brain-mcp', 'jookoi-brain-api'];

if (!fs.existsSync(globalAgentsSkills)) {
  fs.mkdirSync(globalAgentsSkills, { recursive: true });
}

for (const skillName of skillsToLink) {
  const skillSrc = path.join(rootDir, 'skills', skillName);
  const targetSkillDir = path.join(globalAgentsSkills, skillName);

  if (!fs.existsSync(skillSrc)) {
    console.error(`Warning: Skill source directory not found: ${skillSrc}`);
    continue;
  }

  try {
    if (fs.existsSync(targetSkillDir)) {
      const stat = fs.lstatSync(targetSkillDir);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(targetSkillDir);
      } else {
        fs.rmSync(targetSkillDir, { recursive: true, force: true });
      }
    }

    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      fs.symlinkSync(skillSrc, targetSkillDir, symlinkType);
      console.log(`Successfully linked ${skillName} -> ${targetSkillDir} (${symlinkType})`);
    } catch (_symlinkErr) {
      fs.cpSync(skillSrc, targetSkillDir, { recursive: true });
      console.log(`Successfully copied ${skillName} -> ${targetSkillDir}`);
    }
  } catch (err) {
    console.error(`Failed to install skill ${skillName}: ${err.message}`);
  }
}
