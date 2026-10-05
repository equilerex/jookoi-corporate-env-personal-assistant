import { TestBed } from '@angular/core/testing';
import { persistedSignal } from './persisted-signal';

const parse = (v: unknown) => (v === 'a' || v === 'b' ? v : undefined);

describe('persistedSignal', () => {
  beforeEach(() => localStorage.clear());

  it('reads a valid stored value', () => {
    localStorage.setItem('k', JSON.stringify('b'));
    const s = TestBed.runInInjectionContext(() => persistedSignal<'a' | 'b'>('k', 'a', parse));
    expect(s()).toBe('b');
  });

  it('falls back on an invalid or unparsable value', () => {
    localStorage.setItem('k', JSON.stringify('zzz'));
    expect(TestBed.runInInjectionContext(() => persistedSignal<'a' | 'b'>('k', 'a', parse))()).toBe('a');
    localStorage.setItem('k', '{not json');
    expect(TestBed.runInInjectionContext(() => persistedSignal<'a' | 'b'>('k', 'a', parse))()).toBe('a');
  });

  it('writes changes back', () => {
    const s = TestBed.runInInjectionContext(() => persistedSignal<'a' | 'b'>('k', 'a', parse));
    s.set('b');
    TestBed.tick();
    expect(localStorage.getItem('k')).toBe('"b"');
  });
});
