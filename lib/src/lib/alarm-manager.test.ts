import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager } from './alarm-manager';

describe('AlarmManager in isolation', () => {
  let manager: AlarmManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AlarmManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // Timing from cfg.alarm:
  // busyCandidateGap=1500, busyConfirmGap=500, mightNeedAttention=2000, needsAttentionConfirm=3000

  it('state machine advances through silence to ALARM_RINGING', () => {
    const id = 'test-pty';
    manager.toggleAlarm(id);
    expect(manager.getState(id).status).toBe('NOTHING_TO_SHOW');

    // Simulate sustained output over 2 seconds
    manager.onData(id);
    vi.advanceTimersByTime(500);
    manager.onData(id);
    vi.advanceTimersByTime(500);
    manager.onData(id);
    vi.advanceTimersByTime(600); // 1600ms total — past busyCandidateGap
    manager.onData(id);
    manager.onData(id);
    expect(manager.getState(id).status).toBe('BUSY');

    // Clear attention so alarm can ring
    manager.clearAttention(id);

    // Now silence — task finished. Advance past mightNeedAttention (2000ms)
    vi.advanceTimersByTime(2_000);
    expect(manager.getState(id).status).toBe('MIGHT_NEED_ATTENTION');

    // Advance past needsAttentionConfirm (3000ms)
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');
  });

  it('reproduces the exact user scenario: alarm set, 5s task, collapse after 2s, wait 60s', () => {
    const id = 'user-scenario';

    // Step 1: Set alarm
    manager.toggleAlarm(id);
    manager.clearAttention(id);

    // Step 2: Start task — output every 200ms for 5 seconds
    for (let t = 0; t < 5_000; t += 200) {
      manager.onData(id);
      vi.advanceTimersByTime(200);
    }
    // Task is running, monitor should be BUSY
    expect(manager.getState(id).status).toBe('BUSY');

    // Step 3: Minimize after 2s (we're already 5s in, task just finished)
    // From here, no more data. No more attention. Just silence.

    // Step 4: Wait 60 seconds
    vi.advanceTimersByTime(60_000);

    // Step 5: Restore — alarm should already be ringing
    expect(manager.getState(id).status).toBe('ALARM_RINGING');
  });

  it('ALARM_RINGING latches when user has no attention (view hidden)', () => {
    const id = 'latch-test';
    manager.toggleAlarm(id);
    manager.clearAttention(id);

    // Drive to BUSY
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);
    expect(manager.getState(id).status).toBe('BUSY');

    // Silence → ALARM_RINGING
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // New data arrives (e.g. shell prompt) — alarm should NOT reset
    // because the user has no attention (hasn't seen the alarm)
    manager.onData(id);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // Even sustained output shouldn't reset it
    for (let i = 0; i < 10; i++) {
      manager.onData(id);
      vi.advanceTimersByTime(200);
    }
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // But once the user attends (focuses the pane), new data DOES reset
    manager.attend(id);
    manager.onData(id);
    expect(manager.getState(id).status).not.toBe('ALARM_RINGING');
  });

  it('ALARM_RINGING resets on data when user has attention', () => {
    const id = 'reset-test';
    manager.toggleAlarm(id);

    // Drive to ALARM_RINGING while user has attention
    manager.attend(id);
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);

    // Let attention expire, then drive to ringing
    manager.clearAttention(id);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // User comes back and attends
    manager.attend(id);
    // New data should reset the alarm (user has seen it)
    manager.onData(id);
    expect(manager.getState(id).status).not.toBe('ALARM_RINGING');
  });

  it('onStateChange fires when state transitions', () => {
    const id = 'test-notify';
    const states: string[] = [];
    manager.onStateChange((_id, state) => {
      if (_id === id) states.push(state.status);
    });

    manager.toggleAlarm(id);
    manager.clearAttention(id);

    // Drive to BUSY
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);

    // Wait for silence
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);

    expect(states).toContain('BUSY');
    expect(states).toContain('MIGHT_NEED_ATTENTION');
    expect(states).toContain('ALARM_RINGING');
  });
});
