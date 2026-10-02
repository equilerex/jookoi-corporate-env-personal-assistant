// Write side of the notes API: create, save, rename, move, delete. Every path goes through
// `resolveInside`, every name through `validateName`. Last write wins: there is no conflict check.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { classify, isHidden, readDocument, readFolderNode } from './notes.js';
import { PathError, normalizeRel, resolveInside, toRel, validateName } from './paths.js';

// Windows reports these when a scanner or editor briefly holds the file. A short retry clears them.
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

async function withRetry(operation, attempts = 5) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!TRANSIENT.has(error.code) || attempt >= attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

const compareKey = (name) => name.normalize('NFC').toLowerCase();
const parentOf = (rel) => (path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel));

/** A name for a new or renamed item: valid, and not hidden (a dot-name would vanish from the tree). */
function newName(name) {
  const valid = validateName(typeof name === 'string' ? name.trim() : name);
  if (valid.startsWith('.')) throw new PathError('Names cannot start with a dot');
  return valid;
}

/** Notes default to `.md`: a name without any extension gets one. */
const withDefaultExtension = (name) => (/\.[^./]+$/.test(name) ? name : `${name}.md`);

/** Rejects a name that matches a sibling ignoring case, since Windows and macOS treat those as one file. */
async function assertNoSibling(parentAbsolute, name, selfAbsolute) {
  const wanted = compareKey(name);
  for (const entry of await fs.readdir(parentAbsolute)) {
    if (compareKey(entry) !== wanted) continue;
    // Renaming `todo.md` to `Todo.md` collides only with itself.
    if (selfAbsolute && path.join(parentAbsolute, entry) === selfAbsolute) continue;
    throw new PathError(`"${entry}" already exists here`, 409);
  }
}

async function statOrNull(absolute) {
  try {
    return await fs.stat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function requireFolder(rootReal, rel) {
  const absolute = await resolveInside(rootReal, rel);
  const stat = await statOrNull(absolute);
  if (!stat?.isDirectory()) throw new PathError('Folder not found', 404);
  return absolute;
}

/** Writes to a temp file in the same folder, then renames over the target, so a crash never leaves half a note. */
async function atomicWrite(absolute, data) {
  const temp = path.join(path.dirname(absolute), `.viewer-tmp-${randomBytes(6).toString('hex')}`);
  await fs.writeFile(temp, data, 'utf8');
  try {
    await withRetry(() => fs.rename(temp, absolute));
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

export async function createFolder(rootReal, { name, parentId }) {
  const folderName = newName(name);
  const parentRel = normalizeRel(parentId ?? '');
  const parentAbsolute = await requireFolder(rootReal, parentRel);
  await assertNoSibling(parentAbsolute, folderName, null);
  await fs.mkdir(path.join(parentAbsolute, folderName));
  return readFolderNode(rootReal, parentRel ? `${parentRel}/${folderName}` : folderName);
}

export async function createDocument(rootReal, { name, folderId, content }) {
  const fileName = withDefaultExtension(newName(name));
  const parentRel = normalizeRel(folderId ?? '');
  const parentAbsolute = await requireFolder(rootReal, parentRel);
  await assertNoSibling(parentAbsolute, fileName, null);
  await atomicWrite(path.join(parentAbsolute, fileName), typeof content === 'string' ? content.replace(/\r\n/g, '\n') : '');
  return readDocument(rootReal, parentRel ? `${parentRel}/${fileName}` : fileName);
}

/** Saves editor text. Keeps the file's byte order mark and line endings, so a browser edit does not rewrite the whole file. */
export async function saveDocument(rootReal, rel, content) {
  if (typeof content !== 'string') throw new PathError('content must be a string');
  const absolute = await resolveInside(rootReal, rel);
  const parent = await statOrNull(path.dirname(absolute));
  if (!parent?.isDirectory()) throw new PathError('Folder not found', 404);

  const stat = await statOrNull(absolute);
  let bom = false;
  let crlf = false;
  if (stat) {
    if (!stat.isFile()) throw new PathError('Not a file');
    if ((await classify(absolute, path.basename(absolute), stat.size)) === 'binary') throw new PathError('Binary files cannot be edited');
    const existing = await fs.readFile(absolute, 'utf8');
    bom = existing.startsWith('﻿');
    const crlfCount = (existing.match(/\r\n/g) ?? []).length;
    const lfCount = (existing.match(/\n/g) ?? []).length - crlfCount;
    crlf = crlfCount > 0 && crlfCount >= lfCount;
  }

  let text = content.replace(/\r\n/g, '\n');
  if (crlf) text = text.replace(/\n/g, '\r\n');
  await atomicWrite(absolute, (bom ? '﻿' : '') + text);
  return readDocument(rootReal, toRel(rootReal, absolute));
}

const renameOnDisk = (from, to) => withRetry(() => fs.rename(from, to));

/** Renames a file or folder in place and returns its new path. */
export async function renameItem(rootReal, rel, requestedName) {
  const sourceRel = normalizeRel(rel);
  if (!sourceRel) throw new PathError('Cannot rename the root folder');
  const sourceAbsolute = await resolveInside(rootReal, sourceRel);
  const stat = await statOrNull(sourceAbsolute);
  if (!stat) throw new PathError('Not found', 404);

  let name = newName(requestedName);
  const current = path.basename(sourceAbsolute);
  // A note stays a note: dropping the extension while renaming keeps `.md`.
  if (stat.isFile() && /\.md$/i.test(current) && !/\.[^./]+$/.test(name)) name = `${name}.md`;
  if (name === current) return { stat, id: sourceRel };

  const parentAbsolute = path.dirname(sourceAbsolute);
  await assertNoSibling(parentAbsolute, name, sourceAbsolute);
  const targetRel = parentOf(sourceRel) ? `${parentOf(sourceRel)}/${name}` : name;
  await resolveInside(rootReal, targetRel);
  await renameOnDisk(sourceAbsolute, path.join(parentAbsolute, name));
  return { stat, id: targetRel };
}

/** Moves a file or folder into another folder (`null` is the root) and returns its new path. */
export async function moveItem(rootReal, rel, targetFolderId) {
  const sourceRel = normalizeRel(rel);
  if (!sourceRel) throw new PathError('Cannot move the root folder');
  const sourceAbsolute = await resolveInside(rootReal, sourceRel);
  const stat = await statOrNull(sourceAbsolute);
  if (!stat) throw new PathError('Not found', 404);

  const targetRel = normalizeRel(targetFolderId ?? '');
  const targetAbsolute = await requireFolder(rootReal, targetRel);
  const name = path.basename(sourceAbsolute);
  if (targetAbsolute === path.dirname(sourceAbsolute)) return { stat, id: sourceRel };

  if (stat.isDirectory()) {
    const inside = path.relative(sourceAbsolute, targetAbsolute);
    if (inside === '' || (!inside.startsWith('..') && !path.isAbsolute(inside))) throw new PathError('Cannot move a folder into itself');
  }
  await assertNoSibling(targetAbsolute, name, null);
  await renameOnDisk(sourceAbsolute, path.join(targetAbsolute, name));
  return { stat, id: targetRel ? `${targetRel}/${name}` : name };
}

export async function renameResult(rootReal, moved) {
  return moved.stat.isDirectory() ? readFolderNode(rootReal, moved.id) : readDocument(rootReal, moved.id);
}

export async function deleteDocument(rootReal, rel) {
  const absolute = await resolveInside(rootReal, rel);
  const stat = await statOrNull(absolute);
  if (!stat?.isFile()) throw new PathError('File not found', 404);
  await withRetry(() => fs.rm(absolute));
}

async function containsHidden(absolute) {
  for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
    if (isHidden(entry)) return true;
    if (entry.isDirectory() && (await containsHidden(path.join(absolute, entry.name)))) return true;
  }
  return false;
}

/** Deletes a folder and everything in it. Refuses when it holds dotfiles or links the viewer never shows, such as `.git`. */
export async function deleteFolder(rootReal, rel) {
  const folderRel = normalizeRel(rel);
  if (!folderRel) throw new PathError('Cannot delete the root folder');
  const absolute = await requireFolder(rootReal, folderRel);
  if (await containsHidden(absolute)) {
    throw new PathError('This folder holds hidden files or links that the viewer does not show. Delete it outside the viewer.', 409);
  }
  await withRetry(() => fs.rm(absolute, { recursive: true }));
}
