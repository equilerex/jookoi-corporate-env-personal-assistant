// The profile (name, title, department) shown in the sidebar and in the print header. Stored in
// `viewer.config.json` next to the server, git-ignored, and edited from the UI.
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_LENGTH = 120;

export const DEFAULT_PROFILE = { name: 'Joosep Kõivistik', title: 'Expert IT Developer', department: 'DWD Engagement Execution' };

const configPath = () => process.env.VIEWER_CONFIG ?? path.resolve(import.meta.dirname, '..', 'viewer.config.json');

const clean = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_LENGTH) : '');

export async function readProfile() {
  try {
    const stored = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return {
      name: 'name' in stored ? clean(stored.name) : DEFAULT_PROFILE.name,
      title: clean(stored.title),
      department: clean(stored.department),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function writeProfile(input) {
  const profile = { name: clean(input?.name), title: clean(input?.title), department: clean(input?.department) };
  const file = configPath();
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  await fs.rename(temp, file);
  return profile;
}
