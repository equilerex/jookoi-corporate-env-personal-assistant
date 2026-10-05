import { TreeStateNode } from '../models/notes.models';
import { filterTree } from './tree-filter';

const doc = (id: string, name: string): TreeStateNode => ({
  id, name, type: 'document', parentId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null, updatedAt: '',
});
const folder = (id: string, name: string, children: TreeStateNode[]): TreeStateNode => ({
  id, name, type: 'folder', parentId: null, updatedAt: '', children,
});

const tree: TreeStateNode[] = [
  folder('projects', 'projects', [
    folder('projects/alpha', 'alpha', [doc('projects/alpha/plan.md', 'plan.md')]),
    doc('projects/budget.md', 'budget.md'),
  ]),
  doc('Õpetaja.md', 'Õpetaja.md'),
  doc('todo.md', 'todo.md'),
];

describe('filterTree', () => {
  it('returns the input for an empty query', () => {
    expect(filterTree(tree, '  ')).toBe(tree);
  });

  it('matches names, keeps ancestors and expands them', () => {
    const out = filterTree(tree, 'plan');
    expect(out.map((n) => n.id)).toEqual(['projects']);
    expect(out[0].expanded).toBe(true);
    expect(out[0].children![0].expanded).toBe(true);
    expect(out[0].children![0].children![0].id).toBe('projects/alpha/plan.md');
  });

  it('keeps the whole subtree of a matching folder', () => {
    const out = filterTree(tree, 'alpha');
    expect(out[0].children![0].children!.map((n) => n.id)).toEqual(['projects/alpha/plan.md']);
  });

  it('is case and diacritic insensitive', () => {
    expect(filterTree(tree, 'OPETAJA').map((n) => n.id)).toEqual(['Õpetaja.md']);
  });

  it('includes documents found by content', () => {
    const out = filterTree(tree, 'zzz', new Set(['todo.md']));
    expect(out.map((n) => n.id)).toEqual(['todo.md']);
  });

  it('does not mutate the input', () => {
    filterTree(tree, 'plan');
    expect(tree[0].expanded).toBeUndefined();
  });
});
