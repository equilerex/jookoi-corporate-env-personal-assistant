import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SearchResult } from '@shared/models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'jo-search-results',
  host: { '[class.jo-page]': "layout() === 'page'" },
  imports: [MatIconModule],
  template: `
    @if (loading() && !results().length) {
      <p class="jo-search-state">Searching…</p>
    } @else if (!results().length) {
      <p class="jo-search-state">No notes match “{{ query() }}”.</p>
    } @else {
      <p class="jo-search-count">{{ results().length }} {{ results().length === 1 ? 'result' : 'results' }}</p>
      <ul class="jo-search-list">
        @for (result of results(); track result.id) {
          <li>
            <button
              type="button"
              class="jo-search-result"
              [class.jo-search-result--selected]="result.id === selectedId()"
              (click)="open.emit(result.id)"
            >
              <span class="jo-search-result__title">
                <mat-icon>description</mat-icon>
                {{ displayName(result) }}
              </span>
              @if (result.parentId) {
                <span class="jo-search-result__path">{{ result.parentId }}</span>
              }
              @if (result.heading) {
                <span class="jo-search-result__heading"># {{ result.heading }}</span>
              }
              @if (result.snippetParts?.length) {
                <span class="jo-search-result__snippet">
                  @for (part of result.snippetParts; track $index) {
                    @if (part.hit) {
                      <mark>{{ part.text }}</mark>
                    } @else {
                      {{ part.text }}
                    }
                  }
                </span>
              }
            </button>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .jo-search-state,
    .jo-search-count {
      margin: 0;
      padding: 8px 12px;
      font-size: 0.75rem;
      color: var(--jo-text-2);
    }
    .jo-search-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .jo-search-result {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--jo-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .jo-search-result:hover {
      background: rgba(0, 0, 0, 0.05);
    }
    .jo-search-result:focus-visible {
      outline: 2px solid var(--jo-accent);
      outline-offset: -2px;
    }
    .jo-search-result--selected {
      background: rgba(0, 0, 0, 0.07);
    }
    .jo-search-result__title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .jo-search-result__title mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      color: var(--jo-text-2);
    }
    .jo-search-result__path,
    .jo-search-result__heading {
      font-size: 0.7rem;
      color: var(--jo-text-2);
    }
    .jo-search-result__snippet {
      font-size: 0.75rem;
      line-height: 1.4;
      color: var(--jo-text-2);
      overflow-wrap: anywhere;
    }
    :host(.jo-page) {
      max-width: 860px;
      margin: 0 auto;
      padding: 8px 0 32px;
    }
    :host(.jo-page) .jo-search-result {
      padding: 12px 16px;
      gap: 4px;
    }
    :host(.jo-page) .jo-search-result__title { font-size: 1rem; }
    :host(.jo-page) .jo-search-result__path,
    :host(.jo-page) .jo-search-result__heading,
    :host(.jo-page) .jo-search-result__snippet,
    :host(.jo-page) .jo-search-state,
    :host(.jo-page) .jo-search-count { font-size: 0.85rem; }
    mark {
      padding: 0 1px;
      border-radius: 2px;
      background: rgba(255, 200, 0, 0.45);
      color: inherit;
    }
  `,
})
export class SearchResults {
  readonly results = input.required<SearchResult[]>();
  readonly query = input.required<string>();
  readonly layout = input<'compact' | 'page'>('compact');
  readonly loading = input(false);
  readonly selectedId = input<string | null>(null);
  readonly open = output<string>();

  protected displayName(result: SearchResult): string {
    return result.name.replace(/\.md$/i, '');
  }
}
