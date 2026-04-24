import { describe, it, expect } from 'vitest';
import { migrateSessionV1toV2, readPersistedSession, type PersistedSessionV1 } from './session-types';

describe('session migration v1 → v2', () => {
  it('migrates a v1 blob with doors to v2, renaming fields', () => {
    const v1: PersistedSessionV1 = {
      version: 1,
      layout: { panels: { 'pane-a': {} } },
      panes: [
        { id: 'pane-a', title: 'Pane A', cwd: '/home/ned', scrollback: '$ ls\n', resumeCommand: null, alert: null },
        { id: 'pane-b', title: 'Pane B', cwd: null, scrollback: null, resumeCommand: null },
      ],
      detached: [
        {
          id: 'pane-b',
          title: 'Pane B',
          neighborId: 'pane-a',
          direction: 'right',
          remainingPanelIds: ['pane-a'],
          restoreLayout: { panels: { 'pane-a': {}, 'pane-b': {} } },
          detachedLayoutSignature: 'sig-abc',
        },
      ],
    };

    const v2 = migrateSessionV1toV2(v1);

    expect(v2).toEqual({
      version: 2,
      layout: { panels: { 'pane-a': {} } },
      panes: v1.panes,
      doors: [
        {
          id: 'pane-b',
          title: 'Pane B',
          neighborId: 'pane-a',
          direction: 'right',
          remainingPaneIds: ['pane-a'],
          layoutAtMinimize: { panels: { 'pane-a': {}, 'pane-b': {} } },
          layoutAtMinimizeSignature: 'sig-abc',
        },
      ],
    });
  });

  it('migrates a v1 blob with no detached field to v2 with empty doors', () => {
    const v1: PersistedSessionV1 = {
      version: 1,
      layout: null,
      panes: [{ id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null }],
    };

    const v2 = migrateSessionV1toV2(v1);

    expect(v2.version).toBe(2);
    expect(v2.doors).toEqual([]);
  });
});

describe('readPersistedSession', () => {
  it('returns a v2 blob unchanged', () => {
    const v2 = {
      version: 2 as const,
      layout: null,
      panes: [{ id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null }],
      doors: [],
    };
    expect(readPersistedSession(v2)).toBe(v2);
  });

  it('migrates a v1 blob on read', () => {
    const v1 = {
      version: 1 as const,
      layout: null,
      panes: [{ id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null }],
      detached: [
        {
          id: 'pane-b',
          title: 'Pane B',
          neighborId: null,
          direction: 'right' as const,
          remainingPanelIds: [],
          restoreLayout: null,
          detachedLayoutSignature: '',
        },
      ],
    };
    const result = readPersistedSession(v1);
    expect(result?.version).toBe(2);
    expect(result?.doors?.[0]).toMatchObject({
      id: 'pane-b',
      remainingPaneIds: [],
      layoutAtMinimize: null,
      layoutAtMinimizeSignature: '',
    });
  });

  it('returns null for malformed or missing blobs', () => {
    expect(readPersistedSession(null)).toBeNull();
    expect(readPersistedSession(undefined)).toBeNull();
    expect(readPersistedSession({ version: 99 })).toBeNull();
    expect(readPersistedSession('not an object')).toBeNull();
    expect(readPersistedSession({ version: 2, layout: null, panes: 'nope' })).toBeNull();
    expect(readPersistedSession({ version: 2, layout: null, panes: [], doors: {} })).toBeNull();
    expect(readPersistedSession({ version: 1, layout: null, panes: [] as const, detached: {} })).toBeNull();
    expect(readPersistedSession({ version: 1, layout: null, panes: {} })).toBeNull();
  });
});
