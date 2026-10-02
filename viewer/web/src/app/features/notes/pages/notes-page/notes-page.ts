import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink, UrlSegment } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocumentDetail, Profile, SearchResult } from '@shared/models';
import { finalize } from 'rxjs';
import { MarkdownService } from '../../../../core/services/markdown.service';
import { getHttpErrorMessage } from '../../../../shared/utils/http-error-message';
import { MarkdownPreview } from '../../components/markdown-preview/markdown-preview';
import { ProfileService } from '../../../../core/services/profile.service';
import { SearchResults } from '../../components/search-results/search-results';
import { TreeNode } from '../../components/tree-node/tree-node';
import { NotesApiService } from '../../data-access/notes-api.service';
import { NotesTreeStore } from '../../data-access/notes-tree.store';
import { BreadcrumbItem, TreeStateNode } from '../../models/notes.models';
import { findWikiTarget, resolveHref, slugify } from '../../utils/link-resolver';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MarkdownPreview,
    SearchResults,
    TreeNode,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    DatePipe,
    RouterLink,
  ],
  selector: 'jo-notes-page',
  templateUrl: './notes-page.html',
  styleUrl: './notes-page.scss',
})
export class NotesPage {

  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(NotesApiService);
  private readonly markdown = inject(MarkdownService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly treeStore = inject(NotesTreeStore);
  private readonly previewComponent = viewChild(MarkdownPreview);
  private readonly modalInput = viewChild<ElementRef<HTMLInputElement>>('modalInput');
  private readonly draftTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('draftTextarea');
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly profileService = inject(ProfileService);
  protected readonly saving = signal(false);
  protected readonly drawerOpen = signal(false);
  protected readonly isMobile = signal(false);
  protected readonly mobileView = signal<'edit' | 'preview'>('edit');
  protected readonly editorViewMode = signal<'code' | 'split' | 'preview'>('split');
  protected readonly searchQuery = signal('');
  protected readonly searchResults = signal<SearchResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly isSearching = computed(() => this.searchQuery().trim().length > 0);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;
  protected readonly pageError = signal<string | null>(null);
  protected readonly selectedDocument = signal<DocumentDetail | null>(null);
  protected readonly documentLoading = signal(false);
  protected readonly draftContent = signal('');
  protected readonly showScrollTop = signal(false);
  protected readonly draggedNodeId = signal<string | null>(null);
  protected readonly modal = signal<{
    mode: 'folder' | 'rename' | 'move';
    label: string;
    placeholder: string;
    value: string;
    confirm: (value: string) => void;
  } | null>(null);
  protected readonly renderedContent = computed<SafeHtml | string>(() => {
    const content = this.draftContent();
    if (!content || this.docKind() !== 'markdown') {
      return '';
    }

    const html = this.markdown.parse(content);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });
  protected readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    const nodeId = this.selectedNodeId();
    if (!nodeId) {
      return [];
    }

    const pathNodes = this.findPathNodesByNodeId(nodeId, this.treeStore.tree());
    if (!pathNodes?.length) {
      return [];
    }

    const crumbs: BreadcrumbItem[] = [];

    for (let index = 0; index < pathNodes.length - 1; index += 1) {
      crumbs.push({ name: pathNodes[index].name, kind: 'folder', folderId: pathNodes[index].id });
    }

    const last = pathNodes[pathNodes.length - 1];
    crumbs.push({
      name: last.name,
      kind: last.type === 'document' ? 'document' : 'folder',
      folderId: last.type === 'folder' ? last.id : undefined,
      current: true,
    });

    return crumbs;
  });
  protected readonly isDraft = computed(() => !this.selectedDocument() && this.draftContent().trim().length > 0);

  protected readonly isDirty = computed(() => {
    const doc = this.selectedDocument();
    if (!doc) return this.isDraft();
    return doc.content !== this.draftContent();
  });

  protected readonly documentTitle = computed(() => {
    const doc = this.selectedDocument();
    if (doc && doc.kind !== 'markdown') {
      return doc.name;
    }
    const content = this.draftContent();
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : (this.selectedDocument()?.name?.replace(/\.(md|mdx)$/i, '') ?? null);
  });

  constructor() {
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.isMobile.set(result.matches);
        if (result.matches) {
          this.drawerOpen.set(false);
        }
      });

    effect(() => {
      this.renderedContent();
      // Links are resolved against the tree and the open note, so a reloaded tree re-resolves them.
      this.treeStore.tree();
      this.selectedDocument();
      const container = this.previewComponent()?.container()?.nativeElement;
      if (container) {
        queueMicrotask(() => {
          this.addCopyButtons(container);
          this.decoratePreview(container);
          this.injectPrintMeta(container);
          this.applyPendingFragment(container);
          void this.markdown.renderMermaid(container);
        });
      }
    });

    this.profileService.load();
    const onBeforePrint = (): void => this.refreshPrintMeta();
    window.addEventListener('beforeprint', onBeforePrint);
    this.destroyRef.onDestroy(() => window.removeEventListener('beforeprint', onBeforePrint));

    effect(() => {
      if (this.modal()) {
        queueMicrotask(() => {
          this.modalInput()?.nativeElement.focus();
        });
      }
    });

    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((segments) => {
      const pathSegments = this.toPathSegments(segments);
      if (this.treeStore.tree().length === 0) {
        this.treeStore.loadTree(() => this.resolveRouteSegments(pathSegments));
      } else {
        this.resolveRouteSegments(pathSegments);
      }
    });
  }

  // ── File kinds ──────────────────────────────────────────────────────────────
  protected readonly docKind = computed(() => this.selectedDocument()?.kind ?? 'markdown');
  protected readonly isBinary = computed(() => this.docKind() === 'binary');
  protected readonly isTextFile = computed(() => this.docKind() === 'text');
  protected readonly hasFile = computed(() => this.selectedDocument() !== null || this.draftContent().trim().length > 0);
  // Text files only have the editor: no preview, no split view.
  protected readonly paneMode = computed(() => (this.isTextFile() ? 'code' : this.editorViewMode()));
  protected readonly mobilePane = computed(() => (this.isTextFile() ? 'edit' : this.mobileView()));
  protected readonly rawUrl = computed(() => {
    const doc = this.selectedDocument();
    return doc ? this.api.rawUrl(doc.id) : '';
  });
  protected readonly downloadUrl = computed(() => {
    const doc = this.selectedDocument();
    return doc ? this.api.rawUrl(doc.id, true) : '';
  });

  /** `.md` for notes, the file's own extension for other files, `file` when it has none. */
  protected readonly downloadLabel = computed(() => {
    const name = this.selectedDocument()?.name ?? '';
    return name ? (/\.[^./]+$/.exec(name)?.[0] ?? 'file') : '.md';
  });

  // ── View mode: editor, split, preview. Phones have no split view, so they switch between the two panes. ──
  protected readonly viewModeIcon = computed(() => {
    if (this.isMobile()) {
      return this.mobileView() === 'edit' ? 'edit' : 'preview';
    }
    return { code: 'edit', split: 'view_day', preview: 'preview' }[this.editorViewMode()];
  });

  protected readonly viewModeLabel = computed(() => {
    if (this.isMobile()) {
      return this.mobileView() === 'edit' ? 'Editor. Tap for preview' : 'Preview. Tap for editor';
    }
    return {
      code: 'Editor only. Click for split view',
      split: 'Split view. Click for preview only',
      preview: 'Preview only. Click for editor only',
    }[this.editorViewMode()];
  });

  protected cycleViewMode(): void {
    if (this.isMobile()) {
      this.mobileView.set(this.mobileView() === 'edit' ? 'preview' : 'edit');
      return;
    }
    const order = ['code', 'split', 'preview'] as const;
    this.editorViewMode.set(order[(order.indexOf(this.editorViewMode()) + 1) % order.length]);
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Downloads the editor text (including unsaved edits) under the file's name. */
  protected downloadContent(): void {
    const doc = this.selectedDocument();
    const title = this.markdown.sanitizeFilename(this.markdown.extractTitle(this.draftContent()));
    const name = doc?.name ?? `${title || 'untitled'}.md`;
    const url = URL.createObjectURL(new Blob([this.draftContent()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────
  /** Re-reads the tree, the open file and the active search from disk, keeping the rest of the UI as it is. */
  protected refresh(): void {
    if (this.isDirty() && !window.confirm('You have unsaved changes. Reload from disk anyway?')) {
      return;
    }

    const openId = this.selectedDocument()?.id ?? null;
    this.pageError.set(null);
    this.treeStore.loadTree(() => {
      if (openId) {
        this.openDocument(openId);
      }
      if (this.isSearching()) {
        this.runSearch();
      }
    }, true);
  }

  // ── Profile settings ────────────────────────────────────────────────────────
  protected readonly settingsOpen = signal(false);
  protected readonly settingsSaving = signal(false);
  protected readonly settingsDraft = signal<Profile>({ name: '', title: '', department: '' });

  protected openSettings(): void {
    this.settingsDraft.set({ ...(this.profileService.profile() ?? { name: '', title: '', department: '' }) });
    this.settingsOpen.set(true);
  }

  protected updateSettings(field: keyof Profile, value: string): void {
    this.settingsDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected saveSettings(): void {
    this.settingsSaving.set(true);
    this.profileService
      .save(this.settingsDraft())
      .pipe(finalize(() => this.settingsSaving.set(false)))
      .subscribe({
        next: () => this.settingsOpen.set(false),
        error: (error) => this.setError(error),
      });
  }

  // ── Rendered note: links, print header ──────────────────────────────────────
  private pendingFragment: string | null = null;

  /** Points links and images at the right place: tree links get real URLs, outside links open in a tab. No link is restyled or blocked. */
  private decoratePreview(container: HTMLElement): void {
    const currentId = this.selectedDocument()?.id ?? null;
    const fileIds = this.collectFileIds(this.treeStore.tree());

    container.querySelectorAll<HTMLAnchorElement>('a[href], a[data-jo-href], a[data-jo-wiki]').forEach((anchor) => {
      const wiki = anchor.dataset['joWiki'];
      if (wiki !== undefined) {
        // A wikilink becomes an ordinary root-absolute link to the file it names. One that names no file keeps
        // its name, so clicking it opens the page that says "Path not found", like any other missing link.
        const found = findWikiTarget(wiki, fileIds, currentId);
        const path = found ?? (/\.[^./]+$/.test(wiki) ? wiki : `${wiki}.md`).replace(/^\/+/, '');
        const heading = anchor.dataset['joWikiHeading'];
        anchor.dataset['joHref'] = `/${path}${heading ? `#${heading}` : ''}`;
      }
      const original = anchor.dataset['joHref'] ?? anchor.getAttribute('href') ?? '';
      anchor.dataset['joHref'] = original;
      const resolved = resolveHref(original, currentId);

      if (resolved.kind === 'external') {
        anchor.setAttribute('href', original);
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      } else if (resolved.kind === 'anchor') {
        anchor.setAttribute('href', original);
      } else if (resolved.kind === 'internal') {
        // A target that is not in the tree still gets its URL: the page then says "Path not found".
        const fragment = resolved.fragment ? `#${encodeURIComponent(resolved.fragment)}` : '';
        anchor.setAttribute('href', `/notes/${resolved.path.split('/').map(encodeURIComponent).join('/')}${fragment}`);
      } else {
        anchor.setAttribute('href', original);
      }
    });

    container.querySelectorAll<HTMLImageElement>('img[src], img[data-jo-src]').forEach((image) => {
      const original = image.dataset['joSrc'] ?? image.getAttribute('src') ?? '';
      image.dataset['joSrc'] = original;
      const resolved = resolveHref(original, currentId);
      if (resolved.kind === 'internal') {
        image.setAttribute('src', this.api.rawUrl(resolved.path));
      }
    });
  }

  private collectFileIds(nodes: TreeStateNode[]): string[] {
    return nodes.flatMap((node) => (node.type === 'folder' ? this.collectFileIds(node.children ?? []) : [node.id]));
  }

  protected onPreviewClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    const container = this.previewComponent()?.container()?.nativeElement;
    if (!anchor || !container || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const resolved = resolveHref(anchor.dataset['joHref'] ?? anchor.getAttribute('href') ?? '', this.selectedDocument()?.id ?? null);
    // Outside links and links the viewer cannot resolve are left to the browser.
    if (resolved.kind === 'external' || resolved.kind === 'invalid') {
      return;
    }

    event.preventDefault();
    if (resolved.kind === 'anchor') {
      this.scrollToFragment(container, resolved.fragment);
      return;
    }
    if (resolved.path === this.selectedDocument()?.id) {
      if (resolved.fragment) {
        this.scrollToFragment(container, resolved.fragment);
      }
      return;
    }
    if (!this.confirmDiscardDraft()) {
      return;
    }

    this.pendingFragment = resolved.fragment;
    if (this.treeStore.findNodeById(resolved.path)) {
      this.navigateToNode(resolved.path, false);
    } else {
      void this.router.navigate(['notes', ...resolved.path.split('/')]);
    }
  }

  private scrollToFragment(container: HTMLElement, fragment: string): void {
    const wanted = slugify(fragment);
    const heading = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(
      (candidate) => slugify(candidate.textContent ?? '') === wanted,
    );
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private applyPendingFragment(container: HTMLElement): void {
    if (this.pendingFragment === null) {
      return;
    }
    const fragment = this.pendingFragment;
    this.pendingFragment = null;
    this.scrollToFragment(container, fragment);
  }

  /** Print-only line under the first heading: name, title, department and the time of printing. */
  private injectPrintMeta(container: HTMLElement): void {
    container.querySelector('.jo-print-meta')?.remove();
    const meta = document.createElement('div');
    meta.className = 'jo-print-meta';
    this.fillPrintMeta(meta);
    const heading = container.querySelector('h1');
    if (heading) {
      heading.after(meta);
    } else {
      container.prepend(meta);
    }
  }

  private refreshPrintMeta(): void {
    const meta = this.previewComponent()?.container()?.nativeElement.querySelector('.jo-print-meta');
    if (meta instanceof HTMLElement) {
      this.fillPrintMeta(meta);
    }
  }

  /** Name, title and department, then the date, then the time set apart so it reads on its own. */
  private fillPrintMeta(meta: HTMLElement): void {
    const { info, date, time } = this.profileService.printParts();
    const part = (className: string, text: string): HTMLSpanElement => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      return span;
    };
    meta.replaceChildren(part('jo-print-meta__info', info), part('jo-print-meta__date', date), ' ', part('jo-print-meta__time', time));
  }

  protected toggleFolder(nodeId: string): void {
    this.treeStore.toggleFolder(nodeId);
  }

  protected selectedNodeId(): string | null {
    return this.treeStore.selectedNodeId();
  }

  protected handleNodeSelection(node: TreeStateNode): void {
    if (!this.confirmDiscardDraft()) {
      return;
    }
    this.drawerOpen.set(false);
    this.navigateToNode(node.id, false);
  }

  protected createFolder(): void {
    // Succeeds into navigateToNode, which routes through selectFolder and wipes
    // draftContent. Same discard prompt as picking a node in the tree.
    if (!this.confirmDiscardDraft()) {
      return;
    }

    this.modal.set({
      mode: 'folder',
      label: 'New folder',
      placeholder: 'Folder name',
      value: '',
      confirm: (name) => {
        this.modal.set(null);
        this.api.createFolder({ name, parentId: this.treeStore.activeFolderId() }).subscribe({
          next: (folder) => this.treeStore.loadTree(() => this.navigateToNode(folder.id, false), true),
          error: (error) => this.setError(error),
        });
      },
    });
  }

  protected createDocument(): void {
    if (!this.confirmDiscardDraft()) {
      return;
    }

    this.drawerOpen.set(false);
    this.mobileView.set('edit');
    this.selectedDocument.set(null);
    this.treeStore.setSelectedNodeId(null);
    this.draftContent.set('');

    this.focusDraftEditor();
  }

  /** After a rename or move the item has a new path: keep its folders open and continue from there. */
  private afterMove(oldId: string, newId: string): void {
    this.treeStore.remapSavedIds(oldId, newId);
    this.treeStore.loadTree(() => this.navigateToNode(newId, true), true);
  }

  private focusDraftEditor(): void {
    queueMicrotask(() => this.draftTextarea()?.nativeElement.focus());
  }

  protected renameSelected(): void {
    const current = this.treeStore.findNodeById(this.selectedNodeId());
    if (!current) return;
    if (!this.confirmDiscardDraft()) return;

    this.modal.set({
      mode: 'rename',
      label: `Rename ${current.type}`,
      placeholder: 'New name',
      value: current.name,
      confirm: (nextName) => {
        this.modal.set(null);
        if (!nextName.trim()) return;
        if (current.type === 'folder') {
          this.api.renameFolder(current.id, { name: nextName }).subscribe({
            next: (item) => this.afterMove(current.id, item.id),
            error: (error) => this.setError(error),
          });
        } else {
          this.api.renameDocument(current.id, { name: nextName }).subscribe({
            next: (item) => this.afterMove(current.id, item.id),
            error: (error) => this.setError(error),
          });
        }
      },
    });
  }

  protected moveSelected(): void {
    const current = this.treeStore.findNodeById(this.selectedNodeId());
    if (!current) return;
    if (!this.confirmDiscardDraft()) return;

    const currentPath = current.parentId ? (this.getParentPath(current.id) ?? '/') : '/';
    this.modal.set({
      mode: 'move',
      label: `Move to folder`,
      placeholder: 'Path or / for root',
      value: currentPath,
      confirm: (destinationInput) => {
        this.modal.set(null);
        const destinationFolder = this.resolveDestinationFolder(destinationInput);
        if (destinationFolder === undefined) {
          this.pageError.set('Destination folder not found');
          return;
        }
        this.pageError.set(null);
        if (current.type === 'folder') {
          this.api.moveFolder(current.id, { parentId: destinationFolder?.id ?? null }).subscribe({
            next: (item) => this.afterMove(current.id, item.id),
            error: (error) => this.setError(error),
          });
        } else {
          this.api.moveDocument(current.id, { folderId: destinationFolder?.id ?? null }).subscribe({
            next: (item) => this.afterMove(current.id, item.id),
            error: (error) => this.setError(error),
          });
        }
      },
    });
  }

  protected deleteSelected(): void {
    const current = this.treeStore.findNodeById(this.selectedNodeId());
    if (!current) {
      return;
    }

    const confirmed = window.confirm(
      current.type === 'folder'
        ? `Delete folder "${current.name}" and all nested content?`
        : `Delete document "${current.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    const onDelete = (): void => {
      if (current.type === 'document' && this.selectedDocument()?.id === current.id) {
        this.selectedDocument.set(null);
        this.draftContent.set('');
      }

      this.treeStore.reset();
      void this.router.navigateByUrl('/', { replaceUrl: true });
    };

    if (current.type === 'folder') {
      this.api.deleteFolder(current.id).subscribe({
        next: () => onDelete(),
        error: (error) => this.setError(error),
      });
      return;
    }

    this.api.deleteDocument(current.id).subscribe({
      next: () => onDelete(),
      error: (error) => this.setError(error),
    });
  }

  protected saveDocument(): void {
    const selectedDocument = this.selectedDocument();
    const content = this.draftContent();

    if (selectedDocument) {
      this.saving.set(true);
      this.api
        .updateDocument(selectedDocument.id, { content })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: (document) => {
            this.selectedDocument.set(document);
            this.draftContent.set(document.content);
          },
          error: (error) => this.setError(error),
        });
      return;
    }

    if (!content.trim()) {
      return;
    }

    const folderId = this.resolveDraftFolderId();
    const name = this.deriveDraftFileName(folderId);

    this.saving.set(true);
    this.api
      .createDocument({ name, folderId, content })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (document) => this.treeStore.loadTree(() => this.navigateToNode(document.id, false), true),
        error: (error) => this.setError(error),
      });
  }

  private resolveDraftFolderId(): string | null {
    return this.treeStore.activeFolderId();
  }

  private deriveDraftFileName(folderId: string | null): string {
    const title = this.markdown.extractTitle(this.draftContent());
    const sanitized = this.markdown.sanitizeFilename(title) || 'untitled';

    const siblings = folderId
      ? (this.treeStore.findNodeById(folderId)?.children ?? [])
      : this.treeStore.tree();
    const siblingNames = new Set(
      siblings
        .filter((node) => node.type === 'document')
        .map((node) => node.name.toLowerCase()),
    );

    let candidate = `${sanitized}.md`;
    let suffix = 2;
    while (siblingNames.has(candidate.toLowerCase())) {
      candidate = `${sanitized}-${suffix}.md`;
      suffix += 1;
    }

    return candidate;
  }

  protected runSearch(): void {
    clearTimeout(this.searchTimer);
    const query = this.searchQuery().trim();
    this.searchSeq += 1;
    if (!query) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }

    const seq = this.searchSeq;
    this.searching.set(true);
    this.searchTimer = setTimeout(() => {
      this.api.search(query).subscribe({
        next: (results) => {
          if (seq !== this.searchSeq) return;
          this.searchResults.set(results);
          this.searching.set(false);
        },
        error: (error) => {
          if (seq !== this.searchSeq) return;
          this.searching.set(false);
          this.setError(error);
        },
      });
    }, 150);
  }

  protected openSearchResult(id: string): void {
    this.navigateToNode(id, false);
    if (this.isMobile()) {
      this.drawerOpen.set(false);
    }
  }

  protected copyToClipboard(): void {
    const text = this.draftContent();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => alert('Failed to copy'));
  }

  protected scrollToTop(): void {
    const container = this.previewComponent()?.container()?.nativeElement;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      this.showScrollTop.set(false);
    }
  }

  protected onRenderScroll(event: Event): void {
    const target = event.target as HTMLElement;
    this.showScrollTop.set(target.scrollTop > 200);
  }

  protected printContent(): void {
    this.refreshPrintMeta();
    window.print();
  }

  protected focusBreadcrumb(folderId: string): void {
    const node = this.treeStore.findNodeById(folderId);
    if (!node || node.type !== 'folder') {
      return;
    }

    if (!this.confirmDiscardDraft()) {
      return;
    }

    this.navigateToNode(folderId, false);
  }

  private confirmDiscardDraft(): boolean {
    if (!this.isDraft()) {
      return true;
    }

    return window.confirm('Discard unsaved draft?');
  }

  protected changeSortBy(sortBy: 'name' | 'date'): void {
    this.treeStore.setSortBy(sortBy);
  }

  protected handleDragStart(node: TreeStateNode): void {
    this.draggedNodeId.set(node.id);
  }

  protected handleDragEnd(): void {
    this.draggedNodeId.set(null);
    this.rootDropOver.set(false);
  }

  // ── Drop onto the top level ────────────────────────────────────────────────
  protected readonly rootDropOver = signal(false);
  /** Only worth offering when the dragged item is not already at the top level. */
  protected readonly canDropOnRoot = computed(() => this.draggedNodeId()?.includes('/') ?? false);

  protected onRootDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.rootDropOver.set(true);
  }

  protected onRootDrop(event: DragEvent): void {
    event.preventDefault();
    this.rootDropOver.set(false);
    const sourceId = this.draggedNodeId();
    if (sourceId) {
      this.handleDrop({ sourceId, targetId: null });
    }
  }

  protected handleDrop(event: { sourceId: string; targetId: string | null }): void {
    this.draggedNodeId.set(null);

    const sourceNode = this.treeStore.findNodeById(event.sourceId);
    if (!sourceNode) {
      return;
    }

    // The move navigates to the moved node afterwards, which discards the draft.
    if (!this.confirmDiscardDraft()) {
      return;
    }

    if (sourceNode.type === 'folder') {
      this.api.moveFolder(event.sourceId, { parentId: event.targetId }).subscribe({
        next: (item) => this.afterMove(event.sourceId, item.id),
        error: (error) => this.setError(error),
      });
    } else {
      this.api.moveDocument(event.sourceId, { folderId: event.targetId }).subscribe({
        next: (item) => this.afterMove(event.sourceId, item.id),
        error: (error) => this.setError(error),
      });
    }
  }

  private resolveRouteSegments(segments: string[]): void {
    if (segments.length === 0) {
      this.openDefaultFolder();
      return;
    }

    const resolvedNode = this.resolveNodeByPath(segments, this.treeStore.tree());
    if (!resolvedNode) {
      this.pageError.set('Path not found');
      return;
    }

    this.pageError.set(null);
    if (resolvedNode.type === 'folder') {
      this.selectFolder(resolvedNode);
      return;
    }

    this.openDocument(resolvedNode.id);
  }

  private openDefaultFolder(): void {
    this.treeStore.setSelectedNodeId(null);
    this.treeStore.setActiveFolderId(null);
    this.selectedDocument.set(null);
    this.draftContent.set('');
  }

  private selectFolder(node: TreeStateNode): void {
    this.treeStore.setSelectedNodeId(node.id);
    this.treeStore.setActiveFolderId(node.id);
    this.treeStore.expandParents(node.parentId);
    if (!node.expanded) {
      this.treeStore.toggleFolder(node.id);
    }
    this.selectedDocument.set(null);
    this.draftContent.set('');
  }

  private openDocument(id: string): void {
    this.documentLoading.set(true);
    this.api
      .getDocument(id)
      .pipe(finalize(() => this.documentLoading.set(false)))
      .subscribe({
        next: (document) => {
          this.selectedDocument.set(document);
          this.draftContent.set(document.content);
          this.treeStore.setActiveFolderId(document.folderId);
          this.treeStore.setSelectedNodeId(document.id);
          this.treeStore.expandParents(document.folderId);
        },
        error: (error) => this.setError(error),
      });
  }

  protected getNodePathSegments = (nodeId: string): (string[] | null) => {
    return this.findPathSegmentsByNodeId(nodeId, this.treeStore.tree());
  };

  protected findPathSegmentsByNodeId(
    nodeId: string,
    nodes: TreeStateNode[],
    trail: string[] = [],
  ): string[] | null {
    for (const node of nodes) {
      const nextTrail = [...trail, this.toPathSegment(node)];
      if (node.id === nodeId) {
        return nextTrail;
      }

      if (node.children?.length) {
        const match = this.findPathSegmentsByNodeId(nodeId, node.children, nextTrail);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  private navigateToNode(nodeId: string, replaceUrl: boolean): void {
    const pathSegments = this.findPathSegmentsByNodeId(nodeId, this.treeStore.tree());
    if (!pathSegments) {
      return;
    }

    void this.router.navigate(['notes', ...pathSegments], { replaceUrl });
  }

  private toPathSegments(segments: UrlSegment[]): string[] {
    return segments.slice(1).map((segment) => segment.path);
  }

  private resolveNodeByPath(segments: string[], nodes: TreeStateNode[]): TreeStateNode | null {
    let currentNodes = nodes;
    let currentNode: TreeStateNode | null = null;

    for (const [index, segment] of segments.entries()) {
      const isLast = index === segments.length - 1;
      const nextNode = currentNodes.find((node) => {
        if (node.type === 'folder') {
          return node.name === segment;
        }

        return isLast && this.toDocumentPathSegment(node.name) === segment;
      });
      if (!nextNode) {
        return null;
      }

      if (!isLast && nextNode.type !== 'folder') {
        return null;
      }

      currentNode = nextNode;
      currentNodes = nextNode.children ?? [];
    }

    return currentNode;
  }

  private resolveDestinationFolder(destination: string): TreeStateNode | null | undefined {
    const trimmed = destination.trim();
    if (!trimmed || trimmed === '/') {
      return null;
    }

    const normalizedSegments = trimmed
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const resolvedNode = this.resolveNodeByPath(normalizedSegments, this.treeStore.tree());
    if (!resolvedNode || resolvedNode.type !== 'folder') {
      return undefined;
    }

    return resolvedNode;
  }

  private findPathNodesByNodeId(
    nodeId: string,
    nodes: TreeStateNode[],
    trail: TreeStateNode[] = [],
  ): TreeStateNode[] | null {
    for (const node of nodes) {
      const nextTrail = [...trail, node];
      if (node.id === nodeId) {
        return nextTrail;
      }

      if (node.children?.length) {
        const match = this.findPathNodesByNodeId(nodeId, node.children, nextTrail);
        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  private getParentPath(nodeId: string): string | null {
    const segments = this.findPathSegmentsByNodeId(nodeId, this.treeStore.tree());
    if (!segments || segments.length <= 1) {
      return '/';
    }

    return segments.slice(0, -1).join('/');
  }

  private setError(error: unknown): void {
    this.pageError.set(this.getErrorMessage(error));
  }

  private addCopyButtons(container: HTMLElement): void {
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((codeBlock) => {
      const pre = (codeBlock as HTMLElement).parentElement;
      if (!pre || pre.querySelector('.copy-button')) {
        return;
      }

      if (!pre.parentElement?.classList.contains('code-block-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentElement?.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
      }

      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.innerHTML = 'Copy';
      copyButton.title = 'Copy code to clipboard';
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codeBlock.textContent || '');
          copyButton.innerHTML = 'Copied';
          setTimeout(() => {
            copyButton.innerHTML = 'Copy';
          }, 2000);
        } catch {
          copyButton.innerHTML = 'Failed';
          setTimeout(() => {
            copyButton.innerHTML = 'Copy';
          }, 2000);
        }
      });
      pre.parentElement?.appendChild(copyButton);
    });
  }

  private toPathSegment(node: TreeStateNode): string {
    return node.type === 'document' ? this.toDocumentPathSegment(node.name) : node.name;
  }

  private toDocumentPathSegment(name: string): string {
    // The URL keeps the `.md` extension, so a folder `foo` and a note `foo.md` never share a URL.
    return name;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return getHttpErrorMessage(error);
    }

    return 'Unexpected error';
  }
}
