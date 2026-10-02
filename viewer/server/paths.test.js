import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PathError, normalizeRel, resolveInside, validateName } from './paths.js';

describe('normalizeRel', () => {
  it('normalizes plain paths', () => {
    assert.equal(normalizeRel('a/b/c.md'), 'a/b/c.md');
    assert.equal(normalizeRel('/a//b/'), 'a/b');
    assert.equal(normalizeRel(''), '');
  });

  for (const bad of ['../x', 'a/../b', 'a/./b', 'a\\b', 'C:/x', 'a/b.md:stream', 'a\0b', 'a/foo.', 'a/foo ', 'con', 'a/NUL.md', 'LPT1']) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => normalizeRel(bad), PathError);
    });
  }

  it('rejects non-strings', () => {
    assert.throws(() => normalizeRel(undefined), PathError);
  });
});

describe('validateName', () => {
  it('accepts a plain name', () => assert.equal(validateName('Todo.md'), 'Todo.md'));
  for (const bad of ['', '  ', 'a/b', '..', 'x:y', 'bad.']) {
    it(`rejects ${JSON.stringify(bad)}`, () => assert.throws(() => validateName(bad), PathError));
  }
});

describe('resolveInside', () => {
  let tmp;
  let root;
  let sibling;

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-paths-'));
    root = path.join(tmp, 'vault');
    sibling = path.join(tmp, 'vault2');
    await fs.mkdir(path.join(root, 'sub'), { recursive: true });
    await fs.mkdir(sibling);
    await fs.writeFile(path.join(sibling, 'secret.md'), 'x');
    root = await fs.realpath(root);
  });

  after(() => fs.rm(tmp, { recursive: true, force: true }));

  it('resolves existing and not-yet-existing paths inside the root', async () => {
    assert.equal(await resolveInside(root, 'sub'), path.join(root, 'sub'));
    assert.equal(await resolveInside(root, 'sub/new.md'), path.join(root, 'sub', 'new.md'));
    assert.equal(await resolveInside(root, 'a/b/c.md'), path.join(root, 'a', 'b', 'c.md'));
  });

  it('rejects traversal', async () => {
    await assert.rejects(resolveInside(root, '../vault2/secret.md'), PathError);
  });

  it('does not confuse a sibling that shares the root as a prefix', async () => {
    await assert.rejects(resolveInside(root, '../vault2'), PathError);
  });

  it('rejects a symlink or junction that points outside the root', async (t) => {
    const link = path.join(root, 'escape');
    try {
      await fs.symlink(sibling, link, 'junction');
    } catch {
      return t.skip('cannot create links on this machine');
    }
    await assert.rejects(resolveInside(root, 'escape/secret.md'), PathError);
    await assert.rejects(resolveInside(root, 'escape/new.md'), PathError);
  });
});
