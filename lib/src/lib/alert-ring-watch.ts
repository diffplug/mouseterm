import { alertDiagnostic, diagnosticId } from './alert-diagnostics';
import { getActivity, getActivitySnapshot, subscribeToActivity } from './session-activity-store';

/** Shared renderer-side fresh-ring→delay→recheck machine for alarm sinks. */
export interface UnattendedRingWatch {
  readonly diagnosticSink?: 'speech' | 'push';
  /**
   * Whether this sink is switched on. Read when a ring is scheduled *and*
   * again when the timer fires, so toggling the setting mid-delay drops the
   * pending alarm.
   */
  readonly enabled: () => boolean;
  /** How long a ring must stay unattended before firing, read at schedule time. */
  readonly delayMs: () => number;
  /** Act on a ring that survived the delay. Must not throw. */
  readonly fire: (sessionId: string) => void;
}

/**
 * Watch the activity store and fire on unattended rings. Returns a disposer
 * that cancels everything pending.
 */
export function watchUnattendedRings(watch: UnattendedRingWatch): () => void {
  const watcher = diagnosticId();
  const trace = (event: string, id?: string, extra = {}): void => alertDiagnostic(event, {
    watcher, sink: watch.diagnosticSink ?? 'push', sessionId: id ?? null, ...extra,
  });
  trace('watch.start', undefined, { enabled: watch.enabled(), delayMs: watch.delayMs() });
  // Absence means never observed, so restore/reconnect cannot turn an existing
  // ring into a fresh transition.
  const lastStatus = new Map<string, string>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (id: string, reason: string): void => {
    const timer = pending.get(id);
    if (timer === undefined) return;
    trace('watch.cancel', id, { reason });
    clearTimeout(timer);
    pending.delete(id);
  };

  const onActivityChange = (): void => {
    const snapshot = getActivitySnapshot();

    for (const [id, state] of snapshot) {
      const previous = lastStatus.get(id);
      lastStatus.set(id, state.status);

      if (state.status !== 'ALERT_RINGING') {
        // Attended, dismissed, or never ringing — either way nothing to do.
        cancel(id, 'resolved');
        continue;
      }
      // Already ringing, or seen for the first time already ringing.
      if (previous === 'ALERT_RINGING' || previous === undefined) {
        if (previous === undefined) trace('watch.skip', id, { reason: 'existing-ring', ringSeq: state.ringSeq });
        continue;
      }

      if (!watch.enabled()) { trace('watch.skip', id, { reason: 'disabled', ringSeq: state.ringSeq }); continue; }

      const delayMs = watch.delayMs();
      const dueAt = Date.now() + delayMs;
      trace('watch.schedule', id, { dueAt, delayMs, ringSeq: state.ringSeq });
      pending.set(id, setTimeout(() => {
        pending.delete(id);
        // Re-read rather than trusting the closure: the user may have attended
        // or dismissed during the delay, and the setting may have been toggled.
        const status = getActivity(id).status;
        const enabled = watch.enabled();
        trace('watch.timer', id, { dueAt, lateByMs: Date.now() - dueAt, status, enabled, ringSeq: getActivity(id).ringSeq, scheduledRingSeq: state.ringSeq });
        if (status !== 'ALERT_RINGING') return;
        if (!enabled) return;
        watch.fire(id);
      }, delayMs));
    }

    // A Session that left the store entirely (pane killed) must not fire.
    for (const id of [...lastStatus.keys()]) {
      if (snapshot.has(id)) continue;
      lastStatus.delete(id);
      cancel(id, 'removed');
    }
  };

  // Seed from the current snapshot so nothing already on screen counts as fresh.
  onActivityChange();
  const unsubscribe = subscribeToActivity(onActivityChange);

  return () => {
    unsubscribe();
    trace('watch.stop');
    for (const id of pending.keys()) cancel(id, 'dispose');
    pending.clear();
    lastStatus.clear();
  };
}
