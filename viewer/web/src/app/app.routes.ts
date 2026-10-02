import { Route, UrlMatcher, UrlSegment } from '@angular/router';

const notesPathMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (segments[0]?.path !== 'notes') {
    return null;
  }

  return {
    consumed: segments,
  };
};

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'notes',
  },
  {
    matcher: notesPathMatcher,
    title: 'JooKoi-Brain-Vault',
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page').then(
        (module) => module.NotesPage,
      ),
  },
  {
    path: '**',
    redirectTo: 'notes',
  },
];
