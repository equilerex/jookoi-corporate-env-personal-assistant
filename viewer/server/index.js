#!/usr/bin/env node
// Local markdown viewer server. Serves the built UI from ../dist and a JSON API over a folder of
// .md files. No dependencies. Loopback only, no auth (decision 006): it runs on the owner's machine.
//
//   node server/index.js --root <folder> [--port 4180]
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createDocument, createFolder, deleteDocument, deleteFolder, moveItem, renameItem, renameResult, saveDocument } from './files.js';
import { rawFileInfo, readDocument, readTree } from './notes.js';
import { PathError } from './paths.js';
import { readProfile, writeProfile } from './profile.js';
import { SearchIndex } from './search/index.js';

const HOST = '127.0.0.1';
const DIST = path.resolve(import.meta.dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return args;
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
};
const sendJson = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });

/** Host header must be a loopback name on our port, which blocks DNS rebinding. */
const allowedHost = (host, port) => [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes((host ?? '').toLowerCase());

/** JSON body of a write request. Requiring the JSON content type keeps cross-site form posts out. */
async function readJson(req, limit = 1024 * 1024) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new PathError('Expected application/json', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new PathError('Request too large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new PathError('Invalid JSON');
  }
}

/** Streams a file as it is, for "open in a new tab" and "download". */
async function sendRaw(res, rootReal, url) {
  const info = await rawFileInfo(rootReal, url.searchParams.get('path') ?? '', { download: url.searchParams.has('download') });
  res.writeHead(200, {
    'Content-Type': info.type,
    'Content-Length': info.size,
    'Content-Disposition': `${info.disposition}; filename*=UTF-8''${encodeURIComponent(info.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  });
  createReadStream(info.absolute).pipe(res);
}

async function handleApi(req, res, url, rootReal, searchIndex) {
  if (url.pathname === '/api/config') {
    if (req.method === 'GET') return sendJson(res, 200, await readProfile());
    if (req.method === 'PUT') return sendJson(res, 200, await writeProfile(await readJson(req)));
  }
  if (req.method === 'GET' && url.pathname === '/api/notes/raw') {
    return await sendRaw(res, rootReal, url);
  }
  if (req.method === 'GET' && url.pathname === '/api/notes/tree') {
    return sendJson(res, 200, await readTree(rootReal));
  }
  if (req.method === 'GET' && url.pathname === '/api/notes/document') {
    return sendJson(res, 200, await readDocument(rootReal, url.searchParams.get('path') ?? ''));
  }
  if (req.method === 'GET' && url.pathname === '/api/notes/search') {
    return sendJson(res, 200, await searchIndex.search(url.searchParams.get('query') ?? ''));
  }
  return await handleWrite(req, res, url, rootReal);
}

async function handleWrite(req, res, url, rootReal) {
  const route = `${req.method} ${url.pathname}`;
  const target = url.searchParams.get('path') ?? '';

  switch (route) {
    case 'POST /api/notes/folders':
      return sendJson(res, 201, await createFolder(rootReal, await readJson(req)));
    case 'POST /api/notes/documents':
      return sendJson(res, 201, await createDocument(rootReal, await readJson(req)));
    case 'PUT /api/notes/document':
      return sendJson(res, 200, await saveDocument(rootReal, target, (await readJson(req)).content));
    case 'PATCH /api/notes/folders/rename':
    case 'PATCH /api/notes/documents/rename': {
      const moved = await renameItem(rootReal, target, (await readJson(req)).name);
      return sendJson(res, 200, await renameResult(rootReal, moved));
    }
    case 'PATCH /api/notes/folders/move': {
      const moved = await moveItem(rootReal, target, (await readJson(req)).parentId ?? null);
      return sendJson(res, 200, await renameResult(rootReal, moved));
    }
    case 'PATCH /api/notes/documents/move': {
      const moved = await moveItem(rootReal, target, (await readJson(req)).folderId ?? null);
      return sendJson(res, 200, await renameResult(rootReal, moved));
    }
    case 'DELETE /api/notes/document':
      await deleteDocument(rootReal, target);
      return send(res, 204, '');
    case 'DELETE /api/notes/folders':
      await deleteFolder(rootReal, target);
      return send(res, 204, '');
    default:
      return sendJson(res, 404, { message: 'Not found' });
  }
}

async function handleStatic(res, pathname) {
  let target = path.join(DIST, decodeURIComponent(pathname));
  if (path.relative(DIST, target).startsWith('..')) return send(res, 403, 'Forbidden');
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) target = path.join(target, 'index.html');
    await fs.access(target);
  } catch {
    // Client routes such as /notes/projects/foo.md fall back to the app shell, even when they end in .md.
    target = path.join(DIST, 'index.html');
  }
  try {
    const body = await fs.readFile(target);
    send(res, 200, body, { 'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream' });
  } catch {
    send(res, 500, 'The UI is not built. Run "npm run build" in viewer/.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootArg = args.root ?? process.env.VIEWER_ROOT;
  if (!rootArg) {
    console.error('Usage: node server/index.js --root <folder> [--port 4180]');
    process.exit(1);
  }
  const rootReal = await fs.realpath(path.resolve(rootArg));
  if (!(await fs.stat(rootReal)).isDirectory()) {
    console.error(`Not a folder: ${rootReal}`);
    process.exit(1);
  }
  const searchIndex = new SearchIndex(rootReal);
  const port = Number(args.port ?? process.env.VIEWER_PORT ?? 4180);

  const server = http.createServer(async (req, res) => {
    try {
      if (!allowedHost(req.headers.host, port)) return send(res, 421, 'Misdirected request');
      const url = new URL(req.url ?? '/', `http://${HOST}:${port}`);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, rootReal, searchIndex);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return await handleStatic(res, url.pathname);
    } catch (error) {
      if (error instanceof PathError) return sendJson(res, error.status, { message: error.message });
      console.error(error);
      return sendJson(res, 500, { message: 'Internal error' });
    }
  });

  server.listen(port, HOST, () => console.log(`Viewing ${rootReal}\nhttp://localhost:${port}`));
}

main();
