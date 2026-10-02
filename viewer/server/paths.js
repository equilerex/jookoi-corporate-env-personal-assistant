// Path safety for every client-supplied path. A client path is a folder-relative path with `/`
// separators. Nothing here touches the disk except `resolveInside`, which checks symlinks and junctions.
import fs from 'node:fs/promises';
import path from 'node:path';

export class PathError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Reserved on Windows, rejected everywhere so a folder stays portable between machines.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export const isMarkdownName = (name) => /\.md$/i.test(name);

/** Validates a client path and returns it normalized (no empty segments, no leading or trailing `/`). */
export function normalizeRel(rel) {
  if (typeof rel !== 'string') throw new PathError('Invalid path');
  if (rel.includes('\0')) throw new PathError('Invalid path');
  if (rel.includes('\\')) throw new PathError('Invalid path: backslash');
  if (rel.includes(':')) throw new PathError('Invalid path: colon');
  const segments = rel.split('/').filter((segment) => segment !== '');
  for (const segment of segments) {
    if (segment === '.' || segment === '..') throw new PathError('Invalid path: relative segment');
    if (/[. ]$/.test(segment)) throw new PathError('Invalid path: trailing dot or space');
    if (RESERVED.test(segment)) throw new PathError('Invalid path: reserved name');
  }
  return segments.join('/');
}

/** Validates a single new file or folder name (create, rename). */
export function validateName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new PathError('Name is required');
  if (name.includes('/')) throw new PathError('Name cannot contain "/"');
  const normalized = normalizeRel(name);
  if (normalized !== name) throw new PathError('Invalid name');
  return name;
}

const isInside = (rootAbs, targetAbs) => {
  const relative = path.relative(rootAbs, targetAbs);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * Resolves a client path against the real (symlink-free) root and returns the absolute path.
 * Rejects anything that lands outside the root, including through a symlink or junction.
 * The target need not exist: the nearest existing ancestor is what gets resolved.
 */
export async function resolveInside(rootReal, rel) {
  const normalized = normalizeRel(rel);
  const absolute = path.join(rootReal, ...normalized.split('/').filter(Boolean));
  if (!isInside(rootReal, absolute)) throw new PathError('Path is outside the folder', 403);

  let probe = absolute;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (!isInside(rootReal, real)) throw new PathError('Path is outside the folder', 403);
      break;
    } catch (error) {
      if (error instanceof PathError) throw error;
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return absolute;
}

/** The client path of an absolute path inside the root. */
export const toRel = (rootReal, absolute) => path.relative(rootReal, absolute).split(path.sep).join('/');
