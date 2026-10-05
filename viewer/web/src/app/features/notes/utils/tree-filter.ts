import { TreeStateNode } from '../models/notes.models';

/** Lowercase and strip diacritics so "opetaja" matches "Õpetaja". */
export function foldName(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Prunes `nodes` to what matches `query`. A node matches when its name contains every
 * whitespace-separated query term, or (documents) its id is in `contentIds`. A matching
 * folder keeps its whole subtree; ancestors of a match are kept and forced open.
 * Returns clones, so the store's expansion state is never touched. Empty query returns `nodes`.
 */
export function filterTree(
  nodes: readonly TreeStateNode[],
  query: string,
  contentIds: ReadonlySet<string> = new Set(),
): readonly TreeStateNode[] {
  const terms = foldName(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return nodes;
  return prune(nodes, terms, contentIds);
}

function prune(
  nodes: readonly TreeStateNode[],
  terms: string[],
  contentIds: ReadonlySet<string>,
): TreeStateNode[] {
  const out: TreeStateNode[] = [];
  for (const node of nodes) {
    const nameHit = nameMatches(node.name, terms);
    if (node.type === 'folder') {
      if (nameHit) {
        out.push({ ...node, expanded: true });
        continue;
      }
      const children = prune(node.children ?? [], terms, contentIds);
      if (children.length) out.push({ ...node, expanded: true, children });
    } else if (nameHit || contentIds.has(node.id)) {
      out.push(node);
    }
  }
  return out;
}

function nameMatches(name: string, terms: string[]): boolean {
  const folded = foldName(name);
  return terms.every((t) => folded.includes(t));
}
