import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

const KEY_STEP = 16;

/**
 * Vertical drag handle. Emits the proposed width (px, unclamped) while the pointer
 * moves; the parent clamps and stores it. `width` is the current width, so keyboard
 * and drag deltas are relative to it.
 */
@Component({
  selector: 'jo-resize-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': 'Resize sidebar',
    tabindex: '0',
    '[attr.aria-valuenow]': 'width()',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '(pointerdown)': 'start($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'end($event)',
    '(pointercancel)': 'end($event)',
    '(dblclick)': 'defaultRequested.emit()',
    '(keydown.arrowleft)': 'resized.emit(width() - step($event))',
    '(keydown.arrowright)': 'resized.emit(width() + step($event))',
  },
  template: '',
  styles: `
    :host {
      display: block;
      flex: 0 0 10px;
      width: 10px;
      margin: 0 -10px;
      cursor: col-resize;
      touch-action: none;
      position: relative;
      z-index: 5;
    }
    :host::after {
      content: '';
      position: absolute;
      top: 12px;
      bottom: 12px;
      left: 4px;
      width: 2px;
      border-radius: 1px;
      background: transparent;
      transition: background 0.15s;
    }
    :host(:hover)::after,
    :host(:focus-visible)::after,
    :host(.dragging)::after {
      background: rgba(0, 0, 0, 0.25);
    }
  `,
})
export class ResizeHandle {
  readonly width = input.required<number>();
  readonly min = input(200);
  readonly max = input(480);
  readonly resized = output<number>();
  readonly defaultRequested = output<void>();

  private startX = 0;
  private startWidth = 0;
  private dragging = false;

  protected start(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.dragging = true;
    this.startX = e.clientX;
    this.startWidth = this.width();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  protected move(e: PointerEvent): void {
    if (!this.dragging) return;
    this.resized.emit(this.startWidth + e.clientX - this.startX);
  }

  protected end(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    const el = e.currentTarget as HTMLElement;
    el.releasePointerCapture(e.pointerId);
    el.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  protected step(e: Event): number {
    e.preventDefault();
    return (e as KeyboardEvent).shiftKey ? KEY_STEP * 4 : KEY_STEP;
  }
}
