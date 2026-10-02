import { TreeNode } from '@shared/models';

export interface TreeStateNode extends TreeNode {
  expanded?: boolean;
  children?: TreeStateNode[];
}

export interface BreadcrumbItem {
  name: string;
  kind: 'home' | 'folder' | 'document';
  current?: boolean;
  folderId?: string;
}
