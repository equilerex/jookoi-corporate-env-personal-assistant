import { effect, signal, WritableSignal } from '@angular/core';

/**
 * Signal backed by localStorage. Reads once at creation, falls back to `fallback`
 * when storage is unavailable or `parse` rejects the stored value (return undefined
 * to reject). Writes on change. Must be called in an injection context.
 */
export function persistedSignal<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | undefined,
): WritableSignal<T> {
  const state = signal<T>(read(key, fallback, parse));
  effect(() => {
    const value = state();
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage blocked or full: the signal still works for this session
    }
  });
  return state;
}

function read<T>(key: string, fallback: T, parse: (raw: unknown) => T | undefined): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}
