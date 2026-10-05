import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CreateDocumentRequest,
  CreateFolderRequest,
  DocumentDetail,
  MoveDocumentRequest,
  MoveFolderRequest,
  Profile,
  RenameItemRequest,
  SearchResult,
  TreeNode,
  UpdateDocumentRequest,
} from '@shared/models';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Talks to `viewer/server`. Ids are folder-relative paths, which contain `/`, so they travel as the
 * `path` query parameter and never as a URL segment. Write endpoints arrive in stage 3 and answer
 * 501 until then.
 */
@Injectable({ providedIn: 'root' })
export class NotesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/notes`;

  private static byPath(path: string): { params: HttpParams } {
    return { params: new HttpParams().set('path', path) };
  }

  getProfile(): Observable<Profile> {
    return this.http.get<Profile>(`${environment.apiBaseUrl}/config`);
  }

  saveProfile(profile: Profile): Observable<Profile> {
    return this.http.put<Profile>(`${environment.apiBaseUrl}/config`, profile);
  }

  /** URL that streams a file as it is. `download` asks the browser to save it instead of showing it. */
  rawUrl(id: string, download = false): string {
    const params = new URLSearchParams({ path: id });
    if (download) {
      params.set('download', '1');
    }
    return `${this.baseUrl}/raw?${params.toString()}`;
  }

  getTree(): Observable<TreeNode[]> {
    return this.http.get<TreeNode[]>(`${this.baseUrl}/tree`);
  }

  getDocument(id: string): Observable<DocumentDetail> {
    return this.http.get<DocumentDetail>(`${this.baseUrl}/document`, NotesApiService.byPath(id));
  }

  createFolder(payload: CreateFolderRequest): Observable<TreeNode> {
    return this.http.post<TreeNode>(`${this.baseUrl}/folders`, payload);
  }

  createDocument(payload: CreateDocumentRequest): Observable<DocumentDetail> {
    return this.http.post<DocumentDetail>(`${this.baseUrl}/documents`, payload);
  }

  renameFolder(id: string, payload: RenameItemRequest): Observable<TreeNode> {
    return this.http.patch<TreeNode>(`${this.baseUrl}/folders/rename`, payload, NotesApiService.byPath(id));
  }

  renameDocument(id: string, payload: RenameItemRequest): Observable<DocumentDetail> {
    return this.http.patch<DocumentDetail>(`${this.baseUrl}/documents/rename`, payload, NotesApiService.byPath(id));
  }

  moveFolder(id: string, payload: MoveFolderRequest): Observable<TreeNode> {
    return this.http.patch<TreeNode>(`${this.baseUrl}/folders/move`, payload, NotesApiService.byPath(id));
  }

  moveDocument(id: string, payload: MoveDocumentRequest): Observable<DocumentDetail> {
    return this.http.patch<DocumentDetail>(`${this.baseUrl}/documents/move`, payload, NotesApiService.byPath(id));
  }

  updateDocument(id: string, payload: UpdateDocumentRequest): Observable<DocumentDetail> {
    return this.http.put<DocumentDetail>(`${this.baseUrl}/document`, payload, NotesApiService.byPath(id));
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/folders`, NotesApiService.byPath(id));
  }

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/document`, NotesApiService.byPath(id));
  }

  search(query: string, limit?: number): Observable<SearchResult[]> {
    let params = new HttpParams().set('query', query);
    if (limit) params = params.set('limit', limit);
    return this.http.get<SearchResult[]>(`${this.baseUrl}/search`, { params });
  }
}
