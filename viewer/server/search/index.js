// In-memory full-text index over the markdown files. No watcher: every search first runs a stat scan
// and re-reads only files whose mtime or size changed, so results are never stale. The folder is
// small, so a scan costs a few milliseconds. Keep the `search(query)` signature stable: it is the seam
// for swapping in a different engine if the folder ever grows past a few thousand notes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { listMarkdownFiles } from '../notes.js';
import { extractHeadings, tokenize } from './tokenize.js';

const K1 = 1.2;
const B = 0.75;
// Fixed field weights, so a name or heading match outranks a body match regardless of corpus size.
const WEIGHTS = { name: 5, headings: 3, body: 1 };
const FIELDS = Object.keys(WEIGHTS);
const SNIPPET_WINDOW = 200;
const SNIPPET_LEAD = 60;

const termFrequencies = (tokens) => {
  const tf = new Map();
  for (const { term } of tokens) tf.set(term, (tf.get(term) ?? 0) + 1);
  return tf;
};

function buildDoc(file, text) {
  const baseName = path.posix.basename(file.id).replace(/\.md$/i, '');
  const headings = extractHeadings(text);
  const tokens = {
    name: tokenize(baseName),
    headings: tokenize(headings.map((heading) => heading.text).join('\n')),
    body: tokenize(text),
  };
  const parent = path.posix.dirname(file.id);
  return {
    id: file.id,
    name: path.posix.basename(file.id),
    parentId: parent === '.' ? null : parent,
    mtimeMs: file.mtimeMs,
    size: file.size,
    text,
    headings,
    tokens,
    tf: { name: termFrequencies(tokens.name), headings: termFrequencies(tokens.headings), body: termFrequencies(tokens.body) },
  };
}

/** Splits a query into required terms and quoted phrases. The last plain term also matches as a prefix. */
export function parseQuery(query) {
  const parts = [];
  for (const match of query.matchAll(/"([^"]*)"|(\S+)/g)) {
    if (match[1] !== undefined) {
      const terms = tokenize(match[1]).map((token) => token.term);
      if (terms.length) parts.push({ kind: 'phrase', terms });
    } else {
      for (const token of tokenize(match[2])) parts.push({ kind: 'term', term: token.term, prefix: false });
    }
  }
  const last = parts[parts.length - 1];
  if (last?.kind === 'term') last.prefix = true;
  return parts;
}

const termKeys = (doc, part) => {
  const keys = new Set();
  for (const field of FIELDS) {
    if (!part.prefix) {
      if (doc.tf[field].has(part.term)) keys.add(part.term);
    } else {
      for (const key of doc.tf[field].keys()) if (key.startsWith(part.term)) keys.add(key);
    }
  }
  return keys;
};

/** Start positions of a consecutive run of `terms` in a token list. */
function phraseStarts(tokens, terms) {
  const starts = [];
  for (let i = 0; i + terms.length <= tokens.length; i += 1) {
    if (terms.every((term, j) => tokens[i + j].term === term)) starts.push(i);
  }
  return starts;
}

export class SearchIndex {
  constructor(rootReal) {
    this.root = rootReal;
    this.docs = new Map();
    this.stats = { count: 0, df: new Map(), avg: { name: 1, headings: 1, body: 1 } };
  }

  /** Reconciles the index with the folder: reads new or changed files, drops removed ones. */
  async refresh() {
    const files = await listMarkdownFiles(this.root);
    const seen = new Set();
    for (const file of files) {
      seen.add(file.id);
      const known = this.docs.get(file.id);
      if (!known || known.mtimeMs !== file.mtimeMs || known.size !== file.size) await this.load(file);
    }
    for (const id of [...this.docs.keys()]) if (!seen.has(id)) this.docs.delete(id);
    this.computeStats();
  }

  async load(file) {
    try {
      const text = await fs.readFile(path.join(this.root, file.id), 'utf8');
      this.docs.set(file.id, buildDoc(file, text));
    } catch {
      this.docs.delete(file.id);
    }
  }

  computeStats() {
    const df = new Map();
    const totals = { name: 0, headings: 0, body: 0 };
    for (const doc of this.docs.values()) {
      const seen = new Set();
      for (const field of FIELDS) {
        totals[field] += doc.tokens[field].length;
        for (const key of doc.tf[field].keys()) seen.add(key);
      }
      for (const key of seen) df.set(key, (df.get(key) ?? 0) + 1);
    }
    const count = this.docs.size;
    const avg = Object.fromEntries(FIELDS.map((field) => [field, count ? Math.max(totals[field] / count, 1) : 1]));
    this.stats = { count, df, avg };
  }

  idf(key) {
    const { count, df } = this.stats;
    const n = df.get(key) ?? 0;
    return Math.log(1 + (count - n + 0.5) / (n + 0.5));
  }

  bm25(doc, field, key) {
    const tf = doc.tf[field].get(key) ?? 0;
    if (!tf) return 0;
    const length = Math.max(doc.tokens[field].length, 1);
    return (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * length) / this.stats.avg[field]));
  }

  /** Ranked results for a query. Every term and phrase must match. */
  async search(query, { limit = 50 } = {}) {
    const parts = parseQuery(query ?? '');
    if (!parts.length) return [];
    await this.refresh();

    const results = [];
    for (const doc of this.docs.values()) {
      const scored = this.scoreDoc(doc, parts);
      if (scored) results.push({ doc, ...scored });
    }
    results.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));

    return results.slice(0, limit).map(({ doc, hits }) => ({
      id: doc.id,
      name: doc.name,
      type: 'document',
      parentId: doc.parentId,
      ...this.snippet(doc, hits),
    }));
  }

  scoreDoc(doc, parts) {
    let score = 0;
    const hits = [];
    for (const part of parts) {
      if (part.kind === 'term') {
        const keys = termKeys(doc, part);
        if (!keys.size) return null;
        for (const key of keys) {
          const idf = this.idf(key);
          for (const field of FIELDS) score += idf * WEIGHTS[field] * this.bm25(doc, field, key);
        }
        for (const token of doc.tokens.body) {
          if (part.prefix ? token.term.startsWith(part.term) : token.term === part.term) hits.push(token);
        }
      } else {
        let found = false;
        for (const field of FIELDS) {
          const starts = phraseStarts(doc.tokens[field], part.terms);
          if (!starts.length) continue;
          found = true;
          score += WEIGHTS[field] * 2 * (1 + Math.log(starts.length));
          if (field === 'body') for (const start of starts) hits.push(...doc.tokens.body.slice(start, start + part.terms.length));
        }
        if (!found) return null;
      }
    }
    return { score, hits };
  }

  /** Snippet around the densest cluster of body hits, as parts with `hit` flags, plus the heading it sits under. */
  snippet(doc, hits) {
    const sorted = [...hits].sort((a, b) => a.start - b.start);
    let anchor = 0;
    let hasBodyHit = false;
    if (sorted.length) {
      hasBodyHit = true;
      let best = -1;
      for (const hit of sorted) {
        const count = sorted.filter((other) => other.start >= hit.start && other.start < hit.start + SNIPPET_WINDOW).length;
        if (count > best) {
          best = count;
          anchor = hit.start;
        }
      }
    } else {
      anchor = firstProseOffset(doc.text);
    }

    let start = Math.max(0, anchor - (hasBodyHit ? SNIPPET_LEAD : 0));
    if (start > 0) {
      const boundary = doc.text.indexOf(' ', start);
      if (boundary !== -1 && boundary < anchor) start = boundary + 1;
    }
    const end = Math.min(doc.text.length, start + SNIPPET_WINDOW);

    const ranges = sorted
      .filter((hit) => hit.start >= start && hit.end <= end)
      .map((hit) => [hit.start - start, hit.end - start]);
    const raw = doc.text.slice(start, end).replace(/\s/g, ' ');

    const parts = [];
    let cursor = 0;
    for (const [from, to] of ranges) {
      if (from < cursor) continue;
      if (from > cursor) parts.push({ text: raw.slice(cursor, from), hit: false });
      parts.push({ text: raw.slice(from, to), hit: true });
      cursor = to;
    }
    if (cursor < raw.length) parts.push({ text: raw.slice(cursor), hit: false });
    if (parts.length) {
      if (start > 0) parts[0] = { ...parts[0], text: `…${parts[0].text}` };
      if (end < doc.text.length) parts[parts.length - 1] = { ...parts[parts.length - 1], text: `${parts[parts.length - 1].text}…` };
    }

    let heading;
    if (hasBodyHit) {
      for (const candidate of doc.headings) if (candidate.offset <= anchor) heading = candidate.text;
    }
    return { snippetParts: parts, ...(heading ? { heading } : {}) };
  }
}

/** Offset of the first line that is neither blank, a heading, nor a frontmatter fence. */
function firstProseOffset(text) {
  let offset = 0;
  let inFrontmatter = false;
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (index === 0 && trimmed === '---') inFrontmatter = true;
    else if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
    } else if (trimmed && !trimmed.startsWith('#')) {
      return offset + line.indexOf(trimmed);
    }
    offset += line.length + 1;
  }
  return 0;
}
