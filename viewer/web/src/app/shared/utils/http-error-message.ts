import { HttpErrorResponse } from '@angular/common/http';

export function getHttpErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message =
      (error.error as { message?: string | string[] } | null)?.message ?? error.message;
    return Array.isArray(message) ? message.join(', ') : message;
  }

  return 'Unexpected error';
}
