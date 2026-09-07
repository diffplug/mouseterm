// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { alertDiagnosticsConfig } from './alert-diagnostics-config';
import { alertDiagnostic, alertDiagnosticsEnabled, configureAlertDiagnostics, observeAlertFocus } from './alert-diagnostics';
import { createAlertJournal } from '../host/alert-journal';
import { speakTestUtterance } from './alert-speech';

afterEach(() => {
  configureAlertDiagnostics('off');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('defaults off even when a sink is supplied, while speech still works', () => {
  expect(alertDiagnosticsConfig.enabled).toBe(false);
  const sink = vi.fn();
  configureAlertDiagnostics('renderer', sink);
  const speak = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak });
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    constructor(readonly text: string) {}
  });
  expect(speakTestUtterance()).toBe(true);
  expect(speak).toHaveBeenCalledOnce();
  alertDiagnostic('host.stopping');
  expect(alertDiagnosticsEnabled()).toBe(false);
  expect(sink).not.toHaveBeenCalled();
});

it('does not install diagnostic focus listeners while disabled', () => {
  const windowListener = vi.spyOn(window, 'addEventListener');
  const documentListener = vi.spyOn(document, 'addEventListener');
  observeAlertFocus()();
  expect(windowListener).not.toHaveBeenCalled();
  expect(documentListener).not.toHaveBeenCalled();
});

it('does not create log storage for direct host or lifecycle records while disabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alert-gate-'));
  const journal = createAlertJournal(directory);
  try {
    journal.append({ version: 1, source: 'renderer', seq: 1, at: Date.now(), monotonicMs: 1,
      event: 'speech.request', fields: { text: 'Dormouse alarm test' } });
    journal.recordLifecycle('host.stopping');
    journal.recordLifecycle('host.stopped');
    await journal.close();
    await expect(stat(journal.directory)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await journal.close();
    await rm(directory, { recursive: true, force: true });
  }
});
