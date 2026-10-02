export type ResolvedLink =
  | { kind: 'external' }
  | { kind: 'anchor'; fragment: string }
  | { kind: 'internal'; path: string; fragment: string | null }
  | { kind: 'invalid' };

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Resolves a markdown link against the note it appears in. A leading `/` means the folder root, anything
 * else is relative to the current note's folder. The result path uses the same `/`-separated ids as the tree.
 */
export function resolveHref(href: string, currentId: string | null): ResolvedLink {
  const raw = href.trim();
  if (!raw) {
    return { kind: 'invalid' };
  }
  if (EXTERNAL.test(raw)) {
    return { kind: 'external' };
  }
  if (raw.startsWith('#')) {
    return { kind: 'anchor', fragment: decode(raw.slice(1)) };
  }

  const hashAt = raw.indexOf('#');
  const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const fragment = hashAt === -1 ? null : decode(raw.slice(hashAt + 1));
  const pathPart = decode(beforeHash.split('?')[0]);

  const segments = raw.startsWith('/') ? [] : (currentId ?? '').split('/').slice(0, -1).filter(Boolean);
  for (const part of pathPart.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (!segments.length) {
        return { kind: 'invalid' };
      }
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  return segments.length ? { kind: 'internal', path: segments.join('/'), fragment } : { kind: 'invalid' };
}

/** Heading text to anchor name, close to what GitHub does: lowercase, punctuation dropped, spaces to `-`. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');

/**
 * Finds the file a wikilink points at. The target is a file name (`Page`), or a path ending in one
 * (`folder/Page`), with or without `.md`. Several files with the same name resolve to the one in the
 * current note's folder, then the shallowest, then the first alphabetically. `ids` are file ids only.
 */
export function findWikiTarget(target: string, ids: string[], currentId: string | null): string | null {
  const wanted = target.trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (!wanted) {
    return null;
  }

  const hasExtension = /\.[^./]+$/.test(wanted);
  const key = (id: string): string => (hasExtension ? id.toLowerCase() : id.toLowerCase().replace(/\.md$/, ''));
  const folderOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '');
  const currentFolder = currentId ? folderOf(currentId) : '';

  const matches = ids.filter((id) => key(id) === wanted || key(id).endsWith('/' + wanted));
  matches.sort(
    (a, b) =>
      Number(folderOf(b) === currentFolder) - Number(folderOf(a) === currentFolder) ||
      a.split('/').length - b.split('/').length ||
      a.localeCompare(b),
  );
  return matches[0] ?? null;
}
