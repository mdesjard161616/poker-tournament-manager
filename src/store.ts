import { useSyncExternalStore } from 'react';
import { initialState, reduce, type Action } from './logic/reducer';
import { loadState, saveState } from './logic/storage';
import type { AppState } from './logic/types';

export function todayString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeLoad(): AppState | null {
  try {
    return loadState(window.localStorage);
  } catch {
    return null;
  }
}

let state: AppState = safeLoad() ?? initialState(todayString());
let saveError: string | null = null;
const listeners = new Set<() => void>();

// One reducer holds the whole tournament; every action is saved before the UI hears about it.
export function dispatch(action: Action): void {
  const next = reduce(state, action);
  if (next === state) return;
  state = next;
  try {
    state = saveState(window.localStorage, state);
    saveError = null;
  } catch {
    saveError = 'Could not save to this browser. Export a backup from the settings menu.';
  }
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function getSaveError(): string | null {
  return saveError;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}
