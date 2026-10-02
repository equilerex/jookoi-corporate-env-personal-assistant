import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createDocument, createFolder, deleteDocument, deleteFolder, moveItem, renameItem, renameResult, saveDocument } from './files.js';
import { readDocument, readTree } from './notes.js';
import { PathError } from './paths.js';

const rejects = (promise, status) => assert.rejects(promise, (error) => error instanceof PathError && (status === undefined || error.status === status));

describe('write API', () => {
  let root;
  const read = (rel) => fs.readFile(path.join(root, rel));
  const exists = (rel) => fs.access(path.join(root, rel)).then(() => true, () => false);

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-files-')));
    await fs.mkdir(path.join(root, 'projects', 'sub'), { recursive: true });
    await fs.writeFile(path.join(root, 'todo.md'), '# Todo\n');
    await fs.writeFile(path.join(root, 'projects', 'plan.md'), '# Plan\n');
  });
  afterEach(() => fs.rm(root, { recursive: true, force: true }));

  describe('create', () => {
    it('creates a folder and returns its node', async () => {
      const node = await createFolder(root, { name: 'notes', parentId: null });
      assert.equal(node.id, 'notes');
      assert.equal(node.type, 'folder');
      assert.ok(await exists('notes'));
      const nested = await createFolder(root, { name: 'deep', parentId: 'projects' });
      assert.equal(nested.id, 'projects/deep');
      assert.equal(nested.parentId, 'projects');
    });

    it('adds .md to a note name without an extension and keeps other extensions', async () => {
      assert.equal((await createDocument(root, { name: 'ideas', folderId: null, content: 'x' })).id, 'ideas.md');
      assert.equal((await createDocument(root, { name: 'run.sh', folderId: 'projects', content: 'echo' })).id, 'projects/run.sh');
    });

    it('rejects a duplicate ignoring case', async () => {
      await rejects(createDocument(root, { name: 'TODO.md', folderId: null, content: '' }), 409);
      await rejects(createFolder(root, { name: 'Projects', parentId: null }), 409);
    });

    it('rejects bad names and a missing parent', async () => {
      await rejects(createDocument(root, { name: '.hidden.md', folderId: null }), 400);
      await rejects(createDocument(root, { name: 'a/b.md', folderId: null }), 400);
      await rejects(createDocument(root, { name: 'x.md', folderId: 'nope' }), 404);
      await rejects(createDocument(root, { name: 'x.md', folderId: '../outside' }), 400);
    });
  });

  describe('save', () => {
    it('overwrites the file and returns it', async () => {
      const saved = await saveDocument(root, 'todo.md', '# Changed\n');
      assert.equal(saved.content, '# Changed\n');
      assert.equal((await read('todo.md')).toString(), '# Changed\n');
    });

    it('keeps CRLF line endings and a byte order mark', async () => {
      await fs.writeFile(path.join(root, 'win.md'), '﻿one\r\ntwo\r\n');
      const saved = await saveDocument(root, 'win.md', 'one\ntwo\nthree\n');
      assert.equal(saved.content, 'one\r\ntwo\r\nthree\r\n');
      assert.equal((await read('win.md')).toString('utf8'), '﻿one\r\ntwo\r\nthree\r\n');
    });

    it('keeps LF files LF', async () => {
      await saveDocument(root, 'todo.md', 'a\nb\n');
      assert.ok(!(await read('todo.md')).includes('\r'));
    });

    it('recreates a file whose path no longer exists, but not in a missing folder', async () => {
      const saved = await saveDocument(root, 'projects/gone.md', 'back');
      assert.equal(saved.id, 'projects/gone.md');
      await rejects(saveDocument(root, 'missing/x.md', 'x'), 404);
    });

    it('refuses binary files and non-string content', async () => {
      await fs.writeFile(path.join(root, 'a.pdf'), Buffer.from([0, 1, 2]));
      await rejects(saveDocument(root, 'a.pdf', 'x'), 400);
      await rejects(saveDocument(root, 'todo.md', 5), 400);
    });

    it('leaves no temp files behind', async () => {
      await saveDocument(root, 'todo.md', 'x');
      const names = await fs.readdir(root);
      assert.ok(!names.some((name) => name.startsWith('.viewer-tmp')));
    });
  });

  describe('rename', () => {
    it('renames a note and keeps .md when the extension is dropped', async () => {
      const moved = await renameItem(root, 'projects/plan.md', 'roadmap');
      assert.equal(moved.id, 'projects/roadmap.md');
      assert.ok(await exists('projects/roadmap.md'));
      assert.ok(!(await exists('projects/plan.md')));
    });

    it('allows a case-only rename of itself', async () => {
      const moved = await renameItem(root, 'todo.md', 'Todo.md');
      assert.equal(moved.id, 'Todo.md');
      assert.ok((await fs.readdir(root)).includes('Todo.md'));
    });

    it('rejects a collision with another item, ignoring case', async () => {
      await fs.writeFile(path.join(root, 'other.md'), '');
      await rejects(renameItem(root, 'other.md', 'TODO.md'), 409);
    });

    it('renames a folder and returns it with children', async () => {
      const moved = await renameItem(root, 'projects', 'work');
      const node = await renameResult(root, moved);
      assert.equal(node.id, 'work');
      assert.deepEqual(node.children.map((child) => child.id).sort(), ['work/plan.md', 'work/sub']);
    });

    it('refuses the root and unknown paths', async () => {
      await rejects(renameItem(root, '', 'x'), 400);
      await rejects(renameItem(root, 'nope.md', 'x.md'), 404);
    });
  });

  describe('move', () => {
    it('moves a note into a folder and to the root', async () => {
      assert.equal((await moveItem(root, 'todo.md', 'projects')).id, 'projects/todo.md');
      assert.equal((await moveItem(root, 'projects/todo.md', null)).id, 'todo.md');
    });

    it('moves a folder with its content', async () => {
      const moved = await moveItem(root, 'projects/sub', null);
      assert.equal(moved.id, 'sub');
      assert.ok(await exists('sub'));
    });

    it('refuses to move a folder into itself or its own subtree', async () => {
      await rejects(moveItem(root, 'projects', 'projects'), 400);
      await rejects(moveItem(root, 'projects', 'projects/sub'), 400);
    });

    it('rejects a name clash in the target, ignoring case', async () => {
      await fs.writeFile(path.join(root, 'projects', 'TODO.md'), '');
      await rejects(moveItem(root, 'todo.md', 'projects'), 409);
    });

    it('is a no-op when the target is the current folder', async () => {
      assert.equal((await moveItem(root, 'projects/plan.md', 'projects')).id, 'projects/plan.md');
    });
  });

  describe('delete', () => {
    it('deletes a file', async () => {
      await deleteDocument(root, 'todo.md');
      assert.ok(!(await exists('todo.md')));
      await rejects(deleteDocument(root, 'todo.md'), 404);
    });

    it('deletes a folder with its content', async () => {
      await deleteFolder(root, 'projects');
      assert.ok(!(await exists('projects')));
      assert.deepEqual((await readTree(root)).map((node) => node.id), ['todo.md']);
    });

    it('refuses to delete a folder holding hidden files, and the root', async () => {
      await fs.mkdir(path.join(root, 'projects', '.git'));
      await rejects(deleteFolder(root, 'projects'), 409);
      assert.ok(await exists('projects'));
      await rejects(deleteFolder(root, ''), 400);
    });
  });

  it('reads back what it wrote', async () => {
    await createDocument(root, { name: 'x', folderId: null, content: 'hello' });
    assert.equal((await readDocument(root, 'x.md')).content, 'hello');
  });
});
