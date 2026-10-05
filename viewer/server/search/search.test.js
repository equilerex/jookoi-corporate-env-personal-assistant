import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SearchIndex, parseQuery } from './index.js';
import { extractHeadings, fold, tokenize } from './tokenize.js';

describe('tokenize', () => {
  it('folds diacritics and case per token', () => {
    assert.equal(fold('Õpetaja'), 'opetaja');
    assert.equal(fold('Ülikool'), 'ulikool');
    assert.deepEqual(tokenize('Kõik, ÄÖ!').map((t) => t.term), ['koik', 'ao']);
  });

  it('keeps offsets into the original text, also for decomposed characters', () => {
    const text = 'a kõik b';
    const [, token] = tokenize(text);
    assert.equal(text.slice(token.start, token.end), 'kõik');
    assert.equal(token.term, 'koik');
  });

  it('numbers token positions', () => {
    assert.deepEqual(tokenize('one two three').map((t) => t.pos), [0, 1, 2]);
  });
});

describe('extractHeadings', () => {
  it('finds headings and ignores code fences', () => {
    const text = '# Top\n\ntext\n\n```\n# not a heading\n```\n\n## Second ##\n';
    const headings = extractHeadings(text);
    assert.deepEqual(headings.map((h) => [h.level, h.text]), [[1, 'Top'], [2, 'Second']]);
    assert.equal(text.slice(headings[1].offset, headings[1].offset + 6), 'Second');
  });
});

describe('parseQuery', () => {
  it('marks only the last plain term as a prefix', () => {
    assert.deepEqual(parseQuery('alpha beta'), [
      { kind: 'term', term: 'alpha', prefix: false },
      { kind: 'term', term: 'beta', prefix: true },
    ]);
  });

  it('parses quoted phrases and does not prefix them', () => {
    assert.deepEqual(parseQuery('"red fox" dog'), [
      { kind: 'phrase', terms: ['red', 'fox'] },
      { kind: 'term', term: 'dog', prefix: true },
    ]);
    assert.equal(parseQuery('dog "red fox"').at(-1).kind, 'phrase');
  });

  it('returns nothing for punctuation only', () => {
    assert.deepEqual(parseQuery('  ?? '), []);
  });
});

describe('SearchIndex', () => {
  let tmp;
  let index;
  const write = (rel, content) => fs.mkdir(path.dirname(path.join(tmp, rel)), { recursive: true }).then(() => fs.writeFile(path.join(tmp, rel), content));

  before(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'viewer-search-')));
    await write('Budget.md', '# Plans\n\nSomething unrelated here.\n');
    await write('notes/a.md', '# Alpha\n\nThe budget is discussed in the meeting about Õpetaja salaries.\n');
    await write('notes/b.md', '# Beta\n\nA long note.\n\n## Costs\n\nLine about quarterly budget numbers and the red fox.\n');
    await write('notes/c.md', '# Gamma\n\nred and fox are separate here, not together. Nothing else.\n');
    await write('.hidden/secret.md', 'budget secret');
    await write('notes/ignore.txt', 'budget');
    index = new SearchIndex(tmp);
  });

  after(() => fs.rm(tmp, { recursive: true, force: true }));

  it('finds content, not only titles', async () => {
    const results = await index.search('salaries');
    assert.deepEqual(results.map((r) => r.id), ['notes/a.md']);
  });

  it('matches across diacritics', async () => {
    assert.deepEqual((await index.search('opetaja')).map((r) => r.id), ['notes/a.md']);
    assert.deepEqual((await index.search('õpetaja')).map((r) => r.id), ['notes/a.md']);
  });

  it('ranks a name match above body matches', async () => {
    const results = await index.search('budget');
    assert.equal(results[0].id, 'Budget.md');
    assert.deepEqual(new Set(results.map((r) => r.id)), new Set(['Budget.md', 'notes/a.md', 'notes/b.md']));
  });

  it('ranks a heading match above a body-only match', async () => {
    const results = await index.search('costs');
    assert.equal(results[0].id, 'notes/b.md');
  });

  it('honours the limit option', async () => {
    assert.equal((await index.search('budget', { limit: 2 })).length, 2);
    assert.equal((await index.search('budget', { limit: 100 })).length, 3);
  });

  it('requires every term', async () => {
    assert.deepEqual((await index.search('budget salaries')).map((r) => r.id), ['notes/a.md']);
    assert.deepEqual(await index.search('budget zzzzzz'), []);
  });

  it('matches the last term as a prefix', async () => {
    assert.deepEqual((await index.search('sala')).map((r) => r.id), ['notes/a.md']);
    assert.deepEqual(await index.search('salaries bud').then((r) => r.map((x) => x.id)), ['notes/a.md']);
  });

  it('matches quoted phrases only when the words are adjacent', async () => {
    assert.deepEqual((await index.search('"red fox"')).map((r) => r.id), ['notes/b.md']);
  });

  it('skips hidden folders and non-markdown files', async () => {
    const ids = (await index.search('budget')).map((r) => r.id);
    assert.ok(!ids.some((id) => id.includes('hidden') || id.endsWith('.txt')));
  });

  it('highlights exact offsets in the snippet and reports the heading', async () => {
    const [result] = await index.search('quarterly');
    assert.equal(result.id, 'notes/b.md');
    const hit = result.snippetParts.find((part) => part.hit);
    assert.equal(hit.text, 'quarterly');
    assert.equal(result.heading, 'Costs');
  });

  it('shows body text when only the name matches', async () => {
    const [result] = await index.search('Budget plans');
    assert.equal(result.id, 'Budget.md');
    assert.ok(result.snippetParts.length > 0);
  });

  it('picks up added, changed and removed files without a restart', async () => {
    await write('new.md', 'zebra crossing');
    assert.deepEqual((await index.search('zebra')).map((r) => r.id), ['new.md']);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await write('new.md', 'giraffe crossing, longer content');
    assert.deepEqual(await index.search('zebra'), []);
    assert.deepEqual((await index.search('giraffe')).map((r) => r.id), ['new.md']);

    await fs.rm(path.join(tmp, 'new.md'));
    assert.deepEqual(await index.search('giraffe'), []);
  });

  it('returns nothing for an empty query', async () => {
    assert.deepEqual(await index.search(''), []);
  });
});
