import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { TreeStateNode } from '../../models/notes.models';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'jo-tree-node',
  imports: [MatIconModule, MatMenuModule, MatButtonModule],
  template: `
    <a
      [href]="nodeHref()"
      class="jo-tree-node-link"
      (click)="onLinkClick($event)"
    >
    <div
      class="jo-tree-node"
      [class.jo-tree-node--selected]="isSelected()"
      [class.jo-tree-node--dragging]="isDragging()"
      [class.jo-tree-node--drop-target]="isDropHover()"
      [attr.data-node-type]="node().type"
      [draggable]="true"
      (click)="onItemClick($event)"
      (dragstart)="onDragStart($event)"
      (dragend)="onDragEnd($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      @if (node().type === 'folder') {
        <mat-icon 
          class="jo-tree-node__chevron"
          [class.jo-tree-node__chevron--expanded]="node().expanded"
          (click)="onToggleClick($event)"
        >chevron_right</mat-icon>
      } @else {
        <span class="jo-tree-node__spacer"></span>
      }

      <mat-icon class="jo-tree-node__icon" [class.jo-tree-node__icon--folder]="node().type === 'folder'">
        {{ node().type === 'folder' ? 'folder' : 'description' }}
      </mat-icon>

      <span class="jo-tree-node__label">{{ formattedName() }}</span>

      <button
        mat-icon-button
        class="jo-tree-node__menu-btn"
        [matMenuTriggerFor]="nodeMenu"
        (click)="onMenuClick($event)"
        aria-label="Node actions"
      >
        <mat-icon>more_vert</mat-icon>
      </button>

      <mat-menu #nodeMenu>
        <button mat-menu-item (click)="renameNode.emit()">
          <mat-icon>drive_file_rename_outline</mat-icon>Rename
        </button>
        <button mat-menu-item (click)="moveNode.emit()">
          <mat-icon>drive_file_move</mat-icon>Move
        </button>
        <button mat-menu-item class="jo-menu-item--danger" (click)="deleteNode.emit()">
          <mat-icon>delete</mat-icon>Delete
        </button>
      </mat-menu>
    </div>
    </a>

    @if (node().children?.length && node().expanded) {
      <div class="jo-tree-node__group">
        @for (child of node().children; track child.id) {
          <jo-tree-node
            [node]="child"
            [selectedId]="selectedId()"
            [draggedNodeId]="draggedNodeId()"
            [getNodePath]="getNodePath()"
            (select)="select.emit($event)"
            (toggle)="toggle.emit($event)"
            (dragNode)="dragNode.emit($event)"
            (dragEnd)="dragEnd.emit()"
            (dropNode)="dropNode.emit($event)"
            (renameNode)="renameNode.emit()"
            (moveNode)="moveNode.emit()"
            (deleteNode)="deleteNode.emit()"
          />
        }
      </div>
    }
  `,
  styleUrl: './tree-node.scss',
})
export class TreeNode {
  node = input.required<TreeStateNode>();
  selectedId = input<string | null>(null);
  draggedNodeId = input<string | null>(null);
  getNodePath = input.required<(nodeId: string) => string[] | null>();

  select = output<TreeStateNode>();
  toggle = output<TreeStateNode>();
  dragNode = output<TreeStateNode>();
  dragEnd = output<void>();
  dropNode = output<{ sourceId: string; targetId: string }>();
  renameNode = output<void>();
  moveNode = output<void>();
  deleteNode = output<void>();

  protected readonly isSelected = computed(() => this.selectedId() === this.node().id);
  protected readonly isDragging = computed(() => this.draggedNodeId() === this.node().id);
  protected readonly isDropTarget = computed(() => {
    const draggedId = this.draggedNodeId();
    const nodeId = this.node().id;
    if (draggedId === null || this.node().type !== 'folder' || draggedId === nodeId || nodeId.startsWith(`${draggedId}/`)) {
      return false;
    }
    const draggedParent = draggedId.includes('/') ? draggedId.slice(0, draggedId.lastIndexOf('/')) : null;
    return draggedParent !== nodeId;
  });
  /** The pointer is over this folder right now. Only that folder is highlighted, not every folder during a drag. */
  private readonly pointerOver = signal(false);
  protected readonly isDropHover = computed(() => this.isDropTarget() && this.pointerOver());
  protected readonly formattedName = computed(() => this.node().name.replace(/\.(md|mdx)$/i, ''));
  protected readonly nodeHref = computed(() => {
    const pathSegments = this.getNodePath()(this.node().id);
    if (!pathSegments) {
      return '#';
    }
    const encodedSegments = pathSegments.map((seg) => encodeURIComponent(seg));
    return `/notes/${encodedSegments.join('/')}`;
  });

  /**
   * True when the user asked the browser to handle the link itself - new tab,
   * new window, download. Those must fall through to the real `href` so the
   * row keeps working as an ordinary link.
   */
  private isNativeNavigation(event: MouseEvent): boolean {
    return (
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1
    );
  }

  protected onLinkClick(event: MouseEvent): void {
    if (this.isNativeNavigation(event)) {
      return;
    }
    event.preventDefault();
  }

  protected onItemClick(event: MouseEvent): void {
    // This div sits inside the anchor. Returning without stopping propagation
    // lets the event reach `onLinkClick`, which leaves the native navigation
    // alone for modified clicks.
    if (this.isNativeNavigation(event)) {
      return;
    }

    // preventDefault must happen HERE, not only in `onLinkClick`: stopPropagation
    // below keeps the event from ever reaching the anchor's handler, and stopping
    // propagation does not by itself cancel the link's default navigation. Without
    // this the browser does a full page load on every row click.
    event.preventDefault();
    event.stopPropagation();

    if (this.node().type === 'folder') {
      this.toggle.emit(this.node());
    }

    this.select.emit(this.node());
  }

  protected onToggleClick(event: MouseEvent): void {
    // The chevron only expands/collapses - it never navigates, modifiers included.
    event.preventDefault();
    event.stopPropagation();
    this.toggle.emit(this.node());
  }

  /** The row-actions menu must not trigger the surrounding link. */
  protected onMenuClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  protected onDragStart(event: DragEvent): void {
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(this.node()));
    }
    this.dragNode.emit(this.node());
  }

  protected onDragEnd(event: DragEvent): void {
    event.stopPropagation();
    this.dragEnd.emit();
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.isDropTarget()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.pointerOver.set(true);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    event.stopPropagation();
    // Moving onto a child element of this row also fires dragleave. Only clear when the pointer really left.
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
      this.pointerOver.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pointerOver.set(false);

    if (!this.isDropTarget() || !event.dataTransfer) {
      return;
    }

    try {
      const sourceNode = JSON.parse(event.dataTransfer.getData('application/json')) as TreeStateNode;
      if (sourceNode.id !== this.node().id && sourceNode.parentId !== this.node().id) {
        this.dropNode.emit({ sourceId: sourceNode.id, targetId: this.node().id });
      }
    } catch {
      // ignore invalid drag data
    }
  }
}
