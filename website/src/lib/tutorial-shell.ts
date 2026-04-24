/**
 * Tutorial shell — handles the `tut` command in the playground's fake terminal.
 *
 * Provides line editing (echo, backspace) and command parsing.
 * Routes `tut`, `tut status`, `tut reset` to tutorial logic.
 */

// ANSI helpers
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const fg = (code: number) => `${ESC}${code}m`;

const PROMPT = `${fg(32)}user${RESET}@${fg(36)}mouseterm${RESET}:${BOLD}${fg(34)}~${RESET}$ `;

const STORAGE_PREFIX = 'mouseterm-tutorial-step-';
const TOTAL_STEPS = 6;

interface TutorialStep {
  phase: string;
  title: string;
  description: string;
  hint: string;
}

const STEPS: TutorialStep[] = [
  {
    phase: 'See Everything at Once',
    title: 'Split a pane',
    description: "You're juggling multiple tasks. Split this terminal so you can watch two things side by side.",
    hint: 'Drag the split button in the tab header, or drag the tab itself to a drop zone.',
  },
  {
    phase: 'See Everything at Once',
    title: 'Resize your panes',
    description: 'One task needs more room. Drag the divider between panes to give it space.',
    hint: 'Drag the gap between two panes.',
  },
  {
    phase: 'Focus and Background',
    title: 'Zoom in, then zoom back out',
    description: "One terminal needs your full attention. Zoom in to focus, then zoom back out when you're done.",
    hint: 'Double-click a tab header to zoom. Double-click again to unzoom.',
  },
  {
    phase: 'Focus and Background',
    title: 'Detach a pane, then bring it back',
    description: "That task is running in the background — you don't need to watch it. Send it to the baseboard, then click its door when you want it back.",
    hint: 'Click the detach button in the tab header. Click the door in the baseboard to reattach.',
  },
  {
    phase: 'Keyboard Power',
    title: 'Enter command mode and navigate',
    description: 'Navigate between panes without touching the mouse.',
    hint: 'Press Escape to enter command mode. Use arrow keys to move between panes.',
  },
  {
    phase: 'Keyboard Power',
    title: 'Split using keyboard shortcuts',
    description: 'Split a pane without leaving the keyboard.',
    hint: 'In command mode, press " to split top/bottom or % to split left/right.',
  },
];

export type SendOutput = (data: string) => void;

export class TutorialShell {
  private lineBuffer = '';
  private sendOutput: SendOutput;

  constructor(sendOutput: SendOutput) {
    this.sendOutput = sendOutput;
  }

  /** Handle a keystroke from the user. */
  handleInput(data: string): void {
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        this.sendOutput('\r\n');
        this.processCommand(this.lineBuffer.trim());
        this.lineBuffer = '';
      } else if (ch === '\x7f' || ch === '\b') {
        // Backspace
        if (this.lineBuffer.length > 0) {
          this.lineBuffer = this.lineBuffer.slice(0, -1);
          // Move cursor back, overwrite with space, move back again
          this.sendOutput('\b \b');
        }
      } else if (ch >= ' ') {
        // Printable character
        this.lineBuffer += ch;
        this.sendOutput(ch);
      }
    }
  }

  private processCommand(cmd: string): void {
    if (cmd === '') {
      this.sendOutput(PROMPT);
      return;
    }

    if (cmd === 'tut') {
      this.showCurrentStep();
    } else if (cmd === 'tut status') {
      this.showStatus();
    } else if (cmd === 'tut reset') {
      this.resetProgress();
    } else {
      this.sendOutput(`${fg(90)}Unknown command. Type ${fg(36)}tut${fg(90)} to start the tutorial.${RESET}\r\n`);
    }

    this.sendOutput(PROMPT);
  }

  private showCurrentStep(): void {
    const nextStep = this.getNextIncompleteStep();

    if (nextStep === null) {
      this.showCompletion();
      return;
    }

    const step = STEPS[nextStep];
    const stepNum = nextStep + 1;

    this.sendOutput(
      `\r\n` +
      `${DIM}Step ${stepNum}/${TOTAL_STEPS} — ${step.phase}${RESET}\r\n` +
      `${BOLD}${step.title}${RESET}\r\n\r\n` +
      `${step.description}\r\n\r\n` +
      `${DIM}${step.hint}${RESET}\r\n\r\n`
    );
  }

  private showStatus(): void {
    this.sendOutput(`\r\n${BOLD}Tutorial Progress${RESET}\r\n\r\n`);

    let currentPhase = '';
    for (let i = 0; i < TOTAL_STEPS; i++) {
      const step = STEPS[i];
      const done = this.isStepComplete(i);

      if (step.phase !== currentPhase) {
        currentPhase = step.phase;
        this.sendOutput(`${DIM}${currentPhase}${RESET}\r\n`);
      }

      const marker = done ? `${fg(32)}[x]${RESET}` : `${fg(90)}[ ]${RESET}`;
      const label = done ? `${fg(90)}${step.title}${RESET}` : step.title;
      this.sendOutput(`  ${marker} ${label}\r\n`);
    }
    this.sendOutput('\r\n');
  }

  private resetProgress(): void {
    for (let i = 0; i < TOTAL_STEPS; i++) {
      localStorage.removeItem(`${STORAGE_PREFIX}${i + 1}`);
    }
    this.sendOutput(`${fg(32)}Tutorial progress reset.${RESET} Type ${fg(36)}tut${RESET} to start from the beginning.\r\n`);
  }

  private showCompletion(): void {
    this.sendOutput(
      `\r\n` +
      `${fg(32)}${BOLD}You've got it.${RESET} MouseTerm keeps everything visible and nothing in your way.\r\n\r\n` +
      `Ready to try the real thing?\r\n` +
      `  ${fg(36)}→${RESET} Download MouseTerm: ${BOLD}mouseterm.com/#download${RESET}\r\n` +
      `Or keep exploring — this sandbox is yours.\r\n\r\n`
    );
  }

  // --- Progress tracking ---

  isStepComplete(stepIndex: number): boolean {
    return localStorage.getItem(`${STORAGE_PREFIX}${stepIndex + 1}`) === 'true';
  }

  markStepComplete(stepIndex: number): void {
    if (this.isStepComplete(stepIndex)) return;
    localStorage.setItem(`${STORAGE_PREFIX}${stepIndex + 1}`, 'true');
    this.announceCompletion(stepIndex);
  }

  private getNextIncompleteStep(): number | null {
    for (let i = 0; i < TOTAL_STEPS; i++) {
      if (!this.isStepComplete(i)) return i;
    }
    return null;
  }

  private announceCompletion(stepIndex: number): void {
    const step = STEPS[stepIndex];
    const stepNum = stepIndex + 1;

    this.sendOutput(
      `\r\n${fg(32)}✓ Step ${stepNum}/${TOTAL_STEPS}: ${step.title}${RESET}\r\n`
    );

    const nextStep = this.getNextIncompleteStep();
    if (nextStep === null) {
      this.showCompletion();
    } else {
      const next = STEPS[nextStep];
      this.sendOutput(
        `\r\n${DIM}Next — ${next.title}${RESET}\r\n` +
        `${next.description}\r\n` +
        `${DIM}${next.hint}${RESET}\r\n`
      );
    }
    this.sendOutput('\r\n' + PROMPT);
  }
}
