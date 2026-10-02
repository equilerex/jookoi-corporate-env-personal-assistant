/**
 * Node ids are folder-relative paths with `/` separators (for example `projects/foo.md`),
 * not database ids. `parentId` and `folderId` hold the parent folder's path, or null at the root.
 */
export type ItemType = 'folder' | 'document';

export interface TreeNode {
  id: string;
  name: string;
  type: ItemType;
  parentId: string | null;
  updatedAt: string;
  children?: TreeNode[];
}

export interface DocumentDetail {
  id: string;
  name: string;
  folderId: string | null;
  /** `markdown` renders, `text` opens as plain editable text, `binary` can only be downloaded or opened in a tab. */
  kind: 'markdown' | 'text' | 'binary';
  size: number;
  content: string;
  updatedAt: string;
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  type: ItemType;
  parentId: string | null;
  /** The heading the best hit sits under, when there is one. */
  heading?: string;
  /** A snippet of the note split into plain and highlighted parts. */
  snippetParts?: SnippetPart[];
}

export interface CreateFolderRequest {
  name: string;
  parentId: string | null;
}

export interface CreateDocumentRequest {
  name: string;
  folderId: string | null;
  content?: string;
}

export interface RenameItemRequest {
  name: string;
}

export interface MoveFolderRequest {
  parentId: string | null;
}

export interface MoveDocumentRequest {
  folderId: string | null;
}

export interface UpdateDocumentRequest {
  content: string;
}

/** Name, title and department shown in the sidebar and the print header. */
export interface Profile {
  name: string;
  title: string;
  department: string;
}
