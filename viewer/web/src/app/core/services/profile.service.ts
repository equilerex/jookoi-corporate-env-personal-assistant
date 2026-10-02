import { Injectable, computed, inject, signal } from '@angular/core';
import { Profile } from '@shared/models';
import { Observable, tap } from 'rxjs';
import { NotesApiService } from '../../features/notes/data-access/notes-api.service';

const pad = (value: number): string => String(value).padStart(2, '0');

/** The owner's name, title and department. Shown in the sidebar and in the print header. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(NotesApiService);

  /** `null` until the server has answered. */
  readonly profile = signal<Profile | null>(null);

  /** "Joosep's Archive", or just "Archive" when there is no name. Empty until the profile has loaded. */
  readonly archiveTitle = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return '';
    }
    const firstName = profile.name.trim().split(/\s+/)[0];
    return firstName ? `${firstName}'s Archive` : 'Archive';
  });

  load(): void {
    this.api.getProfile().subscribe({
      next: (profile) => this.profile.set(profile),
      error: () => this.profile.set({ name: '', title: '', department: '' }),
    });
  }

  save(profile: Profile): Observable<Profile> {
    return this.api.saveProfile(profile).pipe(tap((saved) => this.profile.set(saved)));
  }

  /**
   * The print header line in three parts: `info` is `name - title - department -` (empty parts left out),
   * `date` is spelled out in the browser's language ("2 October 2026"), `time` is 24-hour `HH:MM`.
   */
  printParts(now: Date = new Date()): { info: string; date: string; time: string } {
    const profile = this.profile();
    const info = [profile?.name, profile?.title, profile?.department].filter((part) => !!part).join(' - ');
    return {
      info: info ? `${info} - ` : '',
      date: now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      time: now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  }
}
