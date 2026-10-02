import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'jo-markdown-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #container
      class="markdown-content prose-content"
      [innerHTML]="html()"
      (scroll)="scroll.emit($event)"
    ></div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px;
      background: var(--jo-workspace, #ffffff);
      scrollbar-width: thin;
      scrollbar-color: #d1d5db transparent;
    }

    :host::-webkit-scrollbar { width: 3px; }
    :host::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 99px; }

    .markdown-content {
      flex: 1;
      min-height: 0;
    }

    @media (max-width: 768px) {
      :host {
        padding: 16px;
      }
    }
  `],
})
export class MarkdownPreview {
  readonly html = input.required<SafeHtml>();
  readonly scroll = output<Event>();

  readonly container = viewChild<ElementRef<HTMLElement>>('container');
}
