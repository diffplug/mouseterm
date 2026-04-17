import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager, TODO_OFF, TODO_SOFT_FULL, TODO_HARD, isSoftTodo } from './alarm-manager';
import { cfg } from '../cfg';

const STRIKE_RECOVERY_MS = cfg.todoBucket.recoverySecondsPerLetter * 1_000;

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

  // --- Soft-TODO bucket tests ---

  function createSoftTodo(id: string): void {
    manager.toggleAlarm(id);
    manager.clearAttention(id);
    // Drive to BUSY → silence → ALARM_RINGING
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');
    // Attend creates soft TODO
    manager.attend(id);
    expect(isSoftTodo(manager.getState(id).todo)).toBe(true);
  }

  it('soft-TODO bucket starts full', () => {
    const id = 'bucket-full';
    createSoftTodo(id);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);
  });

  it('4 keypresses strike all letters and clear soft-TODO', () => {
    const id = 'bucket-drain';
    createSoftTodo(id);

    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.75);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBe(TODO_OFF);
  });

  it('3 keypresses strike 3 letters but do not clear soft-TODO', () => {
    const id = 'bucket-partial';
    createSoftTodo(id);

    for (let i = 0; i < 3; i++) {
      manager.drainTodoBucket(id);
    }

    expect(isSoftTodo(manager.getState(id).todo)).toBe(true);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);
  });

  it('one letter recovers after recoverySecondsPerLetter of idle', () => {
    const id = 'bucket-one-recovery';
    createSoftTodo(id);

    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);

    vi.advanceTimersByTime(STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBeCloseTo(0.75);
  });

  it('recovery ticks repeat until bucket reaches full, then stops', () => {
    const id = 'bucket-full-recovery';
    createSoftTodo(id);

    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);

    // Three recovery ticks bring it back to full.
    vi.advanceTimersByTime(STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);
    vi.advanceTimersByTime(STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBeCloseTo(0.75);
    vi.advanceTimersByTime(STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);

    // Further time advances must not push past full or introduce drift.
    vi.advanceTimersByTime(10 * STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);
  });

  it('a keypress between recovery ticks resets the recovery clock', () => {
    const id = 'bucket-recovery-reset';
    createSoftTodo(id);

    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);

    // Almost-but-not-quite one recovery interval.
    vi.advanceTimersByTime(STRIKE_RECOVERY_MS - 1);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);

    // A fresh strike lands; the recovery clock restarts.
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);

    // Another almost-interval — no tick yet.
    vi.advanceTimersByTime(STRIKE_RECOVERY_MS - 1);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);

    // Crossing the threshold finally restores one letter.
    vi.advanceTimersByTime(2);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);
  });

  it('promoting a partially-struck soft-TODO resets to hard', () => {
    const id = 'bucket-promote';
    createSoftTodo(id);

    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);

    manager.promoteTodo(id);
    expect(manager.getState(id).todo).toBe(TODO_HARD);
  });

  it('hard TODO uses TODO_HARD constant', () => {
    const id = 'bucket-hard';
    manager.toggleTodo(id); // off → hard
    expect(manager.getState(id).todo).toBe(TODO_HARD);
  });

  it('re-attending a ringing alarm resets a partially-struck soft-TODO to full and clears its recovery timer', () => {
    const id = 'bucket-reset-on-reattend';
    createSoftTodo(id);

    // Strike 3 of 4 letters.
    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.25);

    // Drive to ALARM_RINGING again
    manager.clearAttention(id);
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // Re-attend should reset the bucket to full
    manager.attend(id);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);

    // The pending recovery timer from before the re-attend must not fire now
    // that we're already at full (it would be a no-op but would still schedule
    // further ticks in the old code path).
    vi.advanceTimersByTime(10 * STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);
  });

  it('dismissing a ringing alarm resets a partially-struck soft-TODO to full and clears its recovery timer', () => {
    const id = 'bucket-reset-on-dismiss';
    createSoftTodo(id);

    // Strike 2 of 4 letters.
    manager.drainTodoBucket(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBeCloseTo(0.5);

    // Drive to ALARM_RINGING again
    manager.clearAttention(id);
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // Dismiss should reset the bucket to full
    manager.dismissAlarm(id);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);

    vi.advanceTimersByTime(10 * STRIKE_RECOVERY_MS);
    expect(manager.getState(id).todo).toBe(TODO_SOFT_FULL);
  });

  it('re-attending a ringing alarm does NOT override a hard TODO', () => {
    const id = 'bucket-no-reset-hard';
    createSoftTodo(id);

    // Promote to hard
    manager.promoteTodo(id);
    expect(manager.getState(id).todo).toBe(TODO_HARD);

    // Drive to ALARM_RINGING again
    manager.clearAttention(id);
    manager.onData(id);
    vi.advanceTimersByTime(1_600);
    manager.onData(id);
    manager.onData(id);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(3_000);
    expect(manager.getState(id).status).toBe('ALARM_RINGING');

    // Re-attend should NOT change hard TODO
    manager.attend(id);
    expect(manager.getState(id).todo).toBe(TODO_HARD);
  });

  it('drainTodoBucket is a no-op for hard TODOs', () => {
    const id = 'bucket-hard-noop';
    manager.toggleTodo(id);
    manager.drainTodoBucket(id);
    expect(manager.getState(id).todo).toBe(TODO_HARD);
  });
});
