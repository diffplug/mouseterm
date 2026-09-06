import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { alertDiagnostic, configureAlertDiagnostics, type AlertDiagnostic } from './alert-diagnostics';
import { AlertManager } from './alert-manager';

let records: AlertDiagnostic[];
let manager: AlertManager;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  records = [];
  configureAlertDiagnostics('test', (record) => records.push(record));
  manager = new AlertManager();
});
afterEach(() => {
  manager.dispose();
  configureAlertDiagnostics('off');
  vi.useRealTimers();
});

it('preserves dismissal and last output evidence across an hour away', () => {
  manager.onData('s');
  manager.notifyFromProtocol('s', { source: 'OSC 9', title: 'secret raw title', body: 'raw body' });
  manager.dismissAlert('s');
  manager.clearAttention();
  vi.advanceTimersByTime(3_600_000);
  manager.attend('s');
  const dismissal = records.find((r) => r.event === 'manager.dismissAlert')!;
  expect(dismissal.fields).toMatchObject({ sessionId: 's', ringSeq: 1, status: 'ALERT_RINGING', outputChunks: 1 });
  const attention = records.findLast((r) => r.event === 'manager.attention')!;
  expect(attention.fields).toMatchObject({ ringSeq: 1, outputChunks: 1, status: 'WATCHING_DISABLED' });
  expect(attention.at - dismissal.at).toBe(3_600_000);
  expect(JSON.stringify(records)).not.toContain('raw');
});

it('explains rearmed animation deferral after output and a detector reset', () => {
  manager.setDeferAlertsUntilQuiet(true);
  manager.onData('s');
  vi.advanceTimersByTime(500);
  manager.onData('s');
  vi.advanceTimersByTime(1100);
  manager.onData('s');
  manager.notifyFromProtocol('s', { source: 'OSC 9', title: 'private title', body: null });
  expect(records.some((r) => r.event === 'manager.defer')).toBe(true);
  vi.advanceTimersByTime(1000);
  manager.onData('s');
  manager.applyTerminalSemanticEvents('s', [{ type: 'promptStart' }]);
  vi.advanceTimersByTime(4000);
  const wake = records.find((r) => r.event === 'manager.deferTimer')!;
  expect(wake.fields).toMatchObject({ outputChunks: 4, pendingNotification: 'OSC 9' });
  expect(wake.fields.quietDueAt).toBeGreaterThan(wake.at);
  expect(records.filter((r) => r.event === 'manager.deferScheduled')).toHaveLength(2);
  manager.dismissAlert('s');
  vi.advanceTimersByTime(3_600_000);
  expect(records.some((r) => r.event === 'manager.deferFlush')).toBe(false);
  expect(JSON.stringify(records)).not.toContain('private title');
});

it('reports output ignored during resize without recording PTY bytes', () => {
  manager.onResize('s');
  manager.onData('s');
  manager.dismissAlert('s');
  expect(records.find((r) => r.event === 'manager.dismissAlert')?.fields).toMatchObject({
    outputChunks: 1, ignoredResizeChunks: 1, lastAcceptedOutputAt: null, resizeGrace: true,
  });
});

it('bounds storms, reserves room for speech, and reports dropped events', () => {
  for (let i = 0; i < 500; i++) alertDiagnostic('manager.publish');
  alertDiagnostic('speech.request');
  expect(records.filter((r) => r.event === 'speech.request')).toHaveLength(1);
  expect(records).toHaveLength(101);
  vi.advanceTimersByTime(1000);
  alertDiagnostic('manager.publish');
  expect(records.find((r) => r.event === 'diagnostics.dropped')?.fields.count).toBe(401);
});

it('keeps alert delivery working when the diagnostic sink throws', () => {
  configureAlertDiagnostics('broken', () => { throw new Error('disk unavailable'); });
  expect(() => manager.notifyFromProtocol('s', { source: 'OSC 9', title: 'done', body: null })).not.toThrow();
  expect(manager.getState('s').status).toBe('ALERT_RINGING');
});
