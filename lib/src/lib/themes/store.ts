import type { MouseTermTheme } from './types';
// JSON import types are inferred too narrowly — cast at the boundary.
import _bundledThemes from './bundled.json';
const bundledThemes = _bundledThemes as unknown as MouseTermTheme[];

const INSTALLED_KEY = 'mouseterm:installed-themes';
const ACTIVE_KEY = 'mouseterm:active-theme';

const hasStorage = typeof localStorage !== 'undefined';

export function getBundledThemes(): MouseTermTheme[] {
  return bundledThemes;
}

export function getInstalledThemes(): MouseTermTheme[] {
  if (!hasStorage) return [];
  try {
    const raw = localStorage.getItem(INSTALLED_KEY);
    return raw ? (JSON.parse(raw) as MouseTermTheme[]) : [];
  } catch {
    return [];
  }
}

export function getAllThemes(): MouseTermTheme[] {
  return [...getBundledThemes(), ...getInstalledThemes()];
}

export function getTheme(id: string): MouseTermTheme | undefined {
  return getAllThemes().find((t) => t.id === id);
}

export function addInstalledTheme(theme: MouseTermTheme): void {
  if (!hasStorage) return;
  const installed = getInstalledThemes().filter((t) => t.id !== theme.id);
  installed.push(theme);
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
}

export function removeInstalledTheme(id: string): void {
  if (!hasStorage) return;
  const installed = getInstalledThemes().filter((t) => t.id !== id);
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
}

export function getActiveThemeId(): string {
  if (!hasStorage) return getBundledThemes()[0]?.id ?? '';
  return localStorage.getItem(ACTIVE_KEY) ?? getBundledThemes()[0]?.id ?? '';
}

export function setActiveThemeId(id: string): void {
  if (!hasStorage) return;
  localStorage.setItem(ACTIVE_KEY, id);
}
