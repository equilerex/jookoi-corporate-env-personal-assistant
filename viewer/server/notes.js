// Read side of the notes API: the folder tree, single files, and raw file streaming.
import fs from 'node:fs/promises';
import path from 'node:path';
import { PathError, isMarkdownName, resolveInside, toRel } from './paths.js';

const SKIPPED_FOLDERS = new Set(['node_modules']);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'json', 'jsonc', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'scss', 'less', 'html', 'htm', 'xml',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sql', 'csv', 'tsv', 'log', 'gitignore', 'editorconfig', 'vue',
  'svelte', 'graphql', 'proto', 'tex', 'rst', 'adoc', 'org',
]);
const BINARY_EXTENSIONS = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'zip', 'gz', 'tgz', '7z', 'rar', 'tar', 'exe', 'dll',
  'bin', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'mp3', 'mp4', 'mov', 'wav', 'avi', 'woff', 'woff2', 'ttf',
  'otf', 'sqlite', 'db',
]);
// Types a browser can show safely in a new tab. SVG and HTML are deliberately not here: they can run script.
const INLINE_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

const extensionOf = (name) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

/** True for entries the viewer never shows: dotfiles (including its own temp files), symlinks. */
export const isHidden = (entry) => entry.name.startsWith('.') || entry.isSymbolicLink();

/** `markdown`, `text` (open as an editable input, no rendering) or `binary` (download or open in a new tab only). */
export async function classify(absolute, name, size) {
  if (isMarkdownName(name)) return size > MAX_TEXT_BYTES ? 'binary' : 'markdown';
  if (size > MAX_TEXT_BYTES) return 'binary';
  const extension = extensionOf(name);
  if (BINARY_EXTENSIONS.has(extension)) return 'binary';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';

  const handle = await fs.open(absolute, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(size, 8000));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const sample = buffer.subarray(0, bytesRead);
    if (sample.includes(0)) return 'binary';
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return 'text';
  } catch {
    return 'binary';
  } finally {
    await handle.close();
  }
}

/** Folder tree of every visible file. Node ids are folder-relative paths. */
export async function readTree(rootReal, rel = '') {
  const entries = await fs.readdir(path.join(rootReal, rel), { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    if (isHidden(entry)) continue;
    const id = rel ? `${rel}/${entry.name}` : entry.name;
    const isFolder = entry.isDirectory();
    if (isFolder ? SKIPPED_FOLDERS.has(entry.name) : !entry.isFile()) continue;

    const stat = await fs.stat(path.join(rootReal, id));
    const node = {
      id,
      name: entry.name,
      type: isFolder ? 'folder' : 'document',
      parentId: rel || null,
      updatedAt: stat.mtime.toISOString(),
    };
    if (isFolder) node.children = await readTree(rootReal, id);
    nodes.push(node);
  }
  return nodes;
}

/** One folder as a tree node with its children, for create, rename and move responses. */
export async function readFolderNode(rootReal, rel) {
  const absolute = await resolveInside(rootReal, rel);
  const stat = await fs.stat(absolute);
  const parent = path.posix.dirname(rel);
  return {
    id: rel,
    name: path.posix.basename(rel),
    type: 'folder',
    parentId: parent === '.' ? null : parent,
    updatedAt: stat.mtime.toISOString(),
    children: await readTree(rootReal, rel),
  };
}

/** Flat list of every markdown file as `{ id, mtimeMs, size }`, for the search index's stat scan. */
export async function listMarkdownFiles(rootReal, rel = '') {
  const files = [];
  const entries = await fs.readdir(path.join(rootReal, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (isHidden(entry)) continue;
    const id = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) files.push(...(await listMarkdownFiles(rootReal, id)));
    } else if (entry.isFile() && isMarkdownName(entry.name)) {
      const stat = await fs.stat(path.join(rootReal, id));
      files.push({ id, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }
  return files;
}

async function statFile(rootReal, rel) {
  const absolute = await resolveInside(rootReal, rel);
  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') throw new PathError('File not found', 404);
    throw error;
  }
  if (!stat.isFile()) throw new PathError('File not found', 404);
  return { absolute, stat };
}

/** A file for the editor. Binary files come back without content. */
export async function readDocument(rootReal, rel) {
  const { absolute, stat } = await statFile(rootReal, rel);
  const id = toRel(rootReal, absolute);
  const name = path.posix.basename(id);
  const parent = path.posix.dirname(id);
  const kind = await classify(absolute, name, stat.size);
  return {
    id,
    name,
    folderId: parent === '.' ? null : parent,
    kind,
    size: stat.size,
    // A byte order mark is invisible in the editor but would end up inside the text, so it is dropped here
    // and put back by `saveDocument` when the file had one.
    content: kind === 'binary' ? '' : (await fs.readFile(absolute, 'utf8')).replace(/^﻿/, ''),
    updatedAt: stat.mtime.toISOString(),
  };
}

/** What the raw route needs to stream a file: path, content type and a safe disposition. */
export async function rawFileInfo(rootReal, rel, { download }) {
  const { absolute, stat } = await statFile(rootReal, rel);
  const name = path.basename(absolute);
  const inlineType = INLINE_TYPES[extensionOf(name)];
  const kind = await classify(absolute, name, stat.size);
  const type = inlineType ?? (kind === 'binary' ? 'application/octet-stream' : 'text/plain; charset=utf-8');
  const showInline = !download && (inlineType !== undefined || kind !== 'binary');
  return { absolute, name, size: stat.size, type, disposition: showInline ? 'inline' : 'attachment' };
}
