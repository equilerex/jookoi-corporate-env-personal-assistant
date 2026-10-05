import { computed, signal } from '@angular/core';
import { SearchResult } from '@shared/models';
import { NotesApiService } from './notes-api.service';

const DEBOUNCE_MS = 150;

/**
 * Debounced full-text search state: `set(query)` updates the query at once and fetches
 * after a pause. Stale responses are dropped. Not an Angular service; create one per
 * search box inside an injection-free context by passing the API in.
 */
export function createDebouncedSearch(
  api: NotesApiService,
  options: { limit?: number; onError?: (error: unknown) => void } = {},
) {
  const query = signal('');
  const results = signal<SearchResult[]>([]);
  const loading = signal(false);
  const active = computed(() => query().trim().length > 0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  function run(): void {
    clearTimeout(timer);
    const q = query().trim();
    seq += 1;
    if (!q) {
      results.set([]);
      loading.set(false);
      return;
    }
    const mine = seq;
    loading.set(true);
    timer = setTimeout(() => {
      api.search(q, options.limit).subscribe({
        next: (found) => {
          if (mine !== seq) return;
          results.set(found);
          loading.set(false);
        },
        error: (error) => {
          if (mine !== seq) return;
          loading.set(false);
          options.onError?.(error);
        },
      });
    }, DEBOUNCE_MS);
  }

  return {
    query: query.asReadonly(),
    results: results.asReadonly(),
    loading: loading.asReadonly(),
    active,
    set(value: string): void {
      query.set(value);
      run();
    },
    /** Re-run the current query, for example after files changed. */
    refresh: run,
  };
}

export type DebouncedSearch = ReturnType<typeof createDebouncedSearch>;
