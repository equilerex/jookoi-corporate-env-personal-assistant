import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { rawFileInfo, readDocument, readTree } from './notes.js';
import { PathError } from './paths.js';
import { DEFAULT_PROFILE, readProfile, writeProfile } from './profile.js';

describe('files beyond markdown', () => {
  let tmp;
  before(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-notes-')));
    await fs.mkdir(path.join(tmp, 'src'));
    await fs.writeFile(path.join(tmp, 'note.md'), '# Note\n');
    await fs.writeFile(path.join(tmp, 'src', 'app.ts'), 'export const a = 1;\n');
    await fs.writeFile(path.join(tmp, 'Makefile'), 'all:\n\techo hi\n');
    await fs.writeFile(path.join(tmp, 'report.pdf'), Buffer.from('%PDF-1.4\n\0\0binary'));
    await fs.writeFile(path.join(tmp, 'blob.dat'), Buffer.from([1, 2, 0, 3, 255, 254]));
    await fs.writeFile(path.join(tmp, 'page.html'), '<script>alert(1)</script>');
    await fs.writeFile(path.join(tmp, '.hidden.txt'), 'x');
  });
  after(() => fs.rm(tmp, { recursive: true, force: true }));

  it('lists every visible file in the tree, not only markdown', async () => {
    const names = (await readTree(tmp)).map((node) => node.name).sort();
    assert.deepEqual(names, ['Makefile', 'blob.dat', 'note.md', 'page.html', 'report.pdf', 'src']);
  });

  it('classifies markdown, text and binary files', async () => {
    assert.equal((await readDocument(tmp, 'note.md')).kind, 'markdown');
    assert.equal((await readDocument(tmp, 'src/app.ts')).kind, 'text');
    assert.equal((await readDocument(tmp, 'Makefile')).kind, 'text');
    assert.equal((await readDocument(tmp, 'blob.dat')).kind, 'binary');
    assert.equal((await readDocument(tmp, 'report.pdf')).kind, 'binary');
  });

  it('returns content for text files and none for binary files', async () => {
    assert.equal((await readDocument(tmp, 'src/app.ts')).content, 'export const a = 1;\n');
    assert.equal((await readDocument(tmp, 'report.pdf')).content, '');
  });

  it('reports a missing file as 404', async () => {
    await assert.rejects(readDocument(tmp, 'nope.md'), (error) => error instanceof PathError && error.status === 404);
  });

  it('serves a pdf inline, a download as an attachment, and html as plain text', async () => {
    const pdf = await rawFileInfo(tmp, 'report.pdf', { download: false });
    assert.equal(pdf.type, 'application/pdf');
    assert.equal(pdf.disposition, 'inline');
    assert.equal((await rawFileInfo(tmp, 'report.pdf', { download: true })).disposition, 'attachment');
    const html = await rawFileInfo(tmp, 'page.html', { download: false });
    assert.equal(html.type, 'text/plain; charset=utf-8');
    const blob = await rawFileInfo(tmp, 'blob.dat', { download: false });
    assert.equal(blob.disposition, 'attachment');
  });
});

describe('profile', () => {
  let tmp;
  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-profile-'));
    process.env.VIEWER_CONFIG = path.join(tmp, 'viewer.config.json');
  });
  after(async () => {
    delete process.env.VIEWER_CONFIG;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('falls back to the default name when no file exists', async () => {
    assert.deepEqual(await readProfile(), DEFAULT_PROFILE);
  });

  it('stores trimmed values and reads them back', async () => {
    await writeProfile({ name: '  Ada Lovelace ', title: 'Analyst', department: 'Engines' });
    assert.deepEqual(await readProfile(), { name: 'Ada Lovelace', title: 'Analyst', department: 'Engines' });
  });

  it('keeps an empty name empty instead of restoring the default', async () => {
    await writeProfile({ name: '', title: '', department: '' });
    assert.equal((await readProfile()).name, '');
  });
});
