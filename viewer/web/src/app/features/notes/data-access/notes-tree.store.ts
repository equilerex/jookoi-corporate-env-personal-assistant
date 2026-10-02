import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, retry, timer } from 'rxjs';
import { TreeNode } from '@shared/models';
import { TreeStateNode } from '../models/notes.models';
import { NotesApiService } from './notes-api.service';

@Injectable({ providedIn: 'root' })
export class NotesTreeStore {
  private static readonly STORAGE_KEY = 'jo-expanded-ids';

  private readonly api = inject(NotesApiService);
  private readonly treeState = signal<TreeStateNode[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly selectedNodeIdState = signal<string | null>(null);
  private readonly activeFolderIdState = signal<string | null>(null);
  private readonly sortByState = signal<'name' | 'date'>(
    NotesTreeStore.getSavedState()?.sortBy ?? 'name',
  );
  /**
   * Ids that `expandParents` expanded automatically (to reveal a selected
   * folder/document) rather than the user explicitly toggling them open.
   * Excluded from what gets persisted so an auto-reveal never gets "laundered"
   * into storage by a later, unrelated `persistState()` call (e.g. toggling a
   * different folder, or changing sort order) that snapshots the whole tree.
   */
  private readonly autoExpandedIdsState = signal<Set<string>>(new Set());

  readonly tree = this.treeState.asReadonly();
  readonly visibleTree = computed(() => this.sortTree(this.treeState(), this.sortByState()));
  readonly sortBy = this.sortByState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly selectedNodeId = this.selectedNodeIdState.asReadonly();
  readonly activeFolderId = this.activeFolderIdState.asReadonly();
  readonly isEmpty = computed(
    () => !this.loadingState() && !this.errorState() && this.visibleTree().length === 0,
  );

  loadTree(afterLoad?: () => void, quiet = false): void {
    const saved = NotesTreeStore.getSavedState();
    const expandedIds = new Set(saved?.expandedIds ?? []);
    const hasSavedState = saved !== null;

    this.autoExpandedIdsState.set(new Set());

    if (!quiet) {
      this.loadingState.set(true);
    }
    this.errorState.set(null);

    this.api
      .getTree()
      .pipe(
        retry({
          count: 5,
          delay: (_error, retryCount) => timer(retryCount * 250),
        }),
        finalize(() => {
          if (!quiet) {
            this.loadingState.set(false);
          }
        }),
      )
      .subscribe({
        next: (tree) => {
          this.treeState.set(this.markExpanded(tree, expandedIds, hasSavedState));
          afterLoad?.();
        },
        error: (error) => this.errorState.set(this.getErrorMessage(error)),
      });
  }

  setSelectedNodeId(id: string | null): void {
    this.selectedNodeIdState.set(id);
  }

  setActiveFolderId(id: string | null): void {
    this.activeFolderIdState.set(id);
  }

  clearSelection(): void {
    this.selectedNodeIdState.set(null);
    this.activeFolderIdState.set(null);
  }

  reset(): void {
    this.treeState.set([]);
    this.loadingState.set(false);
    this.errorState.set(null);
    this.clearSelection();
  }

  toggleFolder(nodeId: string): void {
    this.treeState.update((nodes) => this.toggleFolderInTree(nodes, nodeId));
    // An explicit toggle is always user intent - whichever way it goes, it
    // overrides any auto-reveal record for this node so a later persist
    // reflects what the user actually did, not a stale auto-expand.
    if (this.autoExpandedIdsState().has(nodeId)) {
      this.autoExpandedIdsState.update((ids) => {
        const next = new Set(ids);
        next.delete(nodeId);
        return next;
      });
    }
    this.persistState();
  }

  /**
   * Expands the ancestor chain of `parentId` in memory only (e.g. to reveal a
   * newly opened document or selected folder). This is NOT user intent about
   * which folders should stay expanded, so it must never be persisted -
   * doing so would silently overwrite the user's deliberate collapse/expand
   * choices with whatever happened to be auto-revealed. Nodes that were
   * already expanded (deliberately, by the user) are never recorded here, so
   * they are never mistaken for an auto-reveal later.
   */
  expandParents(parentId: string | null): void {
    if (!parentId) {
      return;
    }

    let newlyExpandedIds: string[] = [];
    this.treeState.update((nodes) => {
      const result = this.expandParentsInTree(nodes, parentId);
      newlyExpandedIds = result.newlyExpandedIds;
      return result.nodes;
    });

    if (newlyExpandedIds.length) {
      this.autoExpandedIdsState.update((ids) => {
        const next = new Set(ids);
        for (const id of newlyExpandedIds) {
          next.add(id);
        }
        return next;
      });
    }
  }

  findNodeById(id: string | null): TreeStateNode | null {
    if (!id) {
      return null;
    }

    return this.findNodeByIdInTree(id, this.treeState());
  }

  setSortBy(sortBy: 'name' | 'date'): void {
    this.sortByState.set(sortBy);
    this.persistState();
  }

  private getNodeUpdatedDate(node: TreeStateNode): number {
    return new Date(node.updatedAt).getTime();
  }

  private getMaxChildUpdatedDate(node: TreeStateNode): number {
    if (node.type === 'document' || !node.children?.length) {
      return this.getNodeUpdatedDate(node);
    }

    let maxDate = this.getNodeUpdatedDate(node);
    for (const child of node.children) {
      const childDate = this.getMaxChildUpdatedDate(child);
      if (childDate > maxDate) {
        maxDate = childDate;
      }
    }
    return maxDate;
  }

  private sortTree(nodes: TreeStateNode[], sortBy: 'name' | 'date'): TreeStateNode[] {
    const sorted = [...nodes].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        const aDate = this.getMaxChildUpdatedDate(a);
        const bDate = this.getMaxChildUpdatedDate(b);
        return bDate - aDate;
      }
    });

    return sorted.map((node) => ({
      ...node,
      children: node.children ? this.sortTree(node.children, sortBy) : undefined,
    }));
  }

  private markExpanded(nodes: TreeNode[], expandedIds: Set<string>, hasSavedState: boolean): TreeStateNode[] {
    return nodes.map((node) => ({
      ...node,
      expanded: expandedIds.has(node.id) || (!hasSavedState && node.parentId === null),
      children: node.children ? this.markExpanded(node.children, expandedIds, hasSavedState) : undefined,
    }));
  }

  /**
   * Reads the persisted { expandedIds, sortBy } object. Returns `null` when
   * there is nothing saved yet OR the saved value is corrupt - both cases
   * mean "no saved state", which callers use to distinguish a fresh user
   * (defaults apply) from a returning user who saved an empty selection
   * (defaults must NOT apply).
   *
   * Migrates the legacy `jo-expanded-ids` format, a bare JSON array of
   * expanded ids, by reading it as `expandedIds` with a default sort rather
   * than discarding the user's existing expand/collapse state.
   */
  private static getSavedState(): { expandedIds: string[]; sortBy: 'name' | 'date' } | null {
    const saved = localStorage.getItem(NotesTreeStore.STORAGE_KEY);
    if (!saved) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        return { expandedIds: parsed as string[], sortBy: 'name' };
      }

      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { expandedIds?: unknown }).expandedIds)) {
        const candidate = parsed as { expandedIds: string[]; sortBy?: unknown };
        return {
          expandedIds: candidate.expandedIds,
          sortBy: candidate.sortBy === 'date' ? 'date' : 'name',
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persists the current expanded ids together with the current sort order
   * as a single object. Ids that are only expanded because `expandParents`
   * auto-revealed them are subtracted first, so persisted state always
   * reflects deliberate user choices, never incidental display state.
   */
  /** Rewrites persisted expanded-folder ids after a rename or move, so the folder keeps its open state. */
  remapSavedIds(from: string, to: string): void {
    const saved = NotesTreeStore.getSavedState();
    if (!saved || from === to) {
      return;
    }

    const expandedIds = saved.expandedIds.map((id) =>
      id === from ? to : id.startsWith(`${from}/`) ? `${to}${id.slice(from.length)}` : id,
    );
    localStorage.setItem(NotesTreeStore.STORAGE_KEY, JSON.stringify({ ...saved, expandedIds }));
  }

  private persistState(): void {
    const autoExpandedIds = this.autoExpandedIdsState();
    const expandedIds = this.collectExpandedIds(this.treeState()).filter(
      (id) => !autoExpandedIds.has(id),
    );
    const state = {
      expandedIds,
      sortBy: this.sortByState(),
    };
    localStorage.setItem(NotesTreeStore.STORAGE_KEY, JSON.stringify(state));
  }

  private collectExpandedIds(nodes: TreeStateNode[]): string[] {
    const ids: string[] = [];

    for (const node of nodes) {
      if (node.expanded) {
        ids.push(node.id);
      }

      if (node.children?.length) {
        ids.push(...this.collectExpandedIds(node.children));
      }
    }

    return ids;
  }

  private toggleFolderInTree(nodes: TreeStateNode[], nodeId: string): TreeStateNode[] {
    return nodes.map((node) => {
      if (node.id === nodeId && node.type === 'folder') {
        return { ...node, expanded: !node.expanded };
      }

      if (node.children?.length) {
        return {
          ...node,
          children: this.toggleFolderInTree(node.children, nodeId),
        };
      }

      return node;
    });
  }

  private expandParentsInTree(
    nodes: TreeStateNode[],
    parentId: string,
  ): { nodes: TreeStateNode[]; found: boolean; newlyExpandedIds: string[] } {
    let found = false;
    const newlyExpandedIds: string[] = [];

    const nextNodes = nodes.map((node) => {
      if (node.id === parentId) {
        found = true;
        if (!node.expanded) {
          newlyExpandedIds.push(node.id);
        }
        return { ...node, expanded: true };
      }

      if (node.children?.length) {
        const result = this.expandParentsInTree(node.children, parentId);
        if (result.found) {
          found = true;
          newlyExpandedIds.push(...result.newlyExpandedIds);
          if (!node.expanded) {
            newlyExpandedIds.push(node.id);
          }
        }

        return {
          ...node,
          expanded: result.found ? true : node.expanded,
          children: result.nodes,
        };
      }

      return node;
    });

    return { nodes: nextNodes, found, newlyExpandedIds };
  }

  private findNodeByIdInTree(id: string, nodes: TreeStateNode[]): TreeStateNode | null {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }

      if (node.children?.length) {
        const match = this.findNodeByIdInTree(id, node.children);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message =
        (error.error as { message?: string | string[] } | null)?.message ?? error.message;
      return Array.isArray(message) ? message.join(', ') : message;
    }

    return 'Unexpected error';
  }
}
