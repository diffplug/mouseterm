import { describe, expect, it, vi } from "vitest";
import { TutorialShell, type InteractiveProgram } from "./tutorial-shell";

function createHarness() {
  const output: string[] = [];
  let exitProgram: (() => void) | null = null;
  const program: InteractiveProgram = {
    start: vi.fn(),
    handleInput: vi.fn(),
    dispose: vi.fn(),
  };
  const startAsciiSplash = vi.fn((args: string[], onExit: () => void) => {
    exitProgram = onExit;
    return program;
  });
  const shell = new TutorialShell((data) => output.push(data), startAsciiSplash);
  return { output, program, shell, startAsciiSplash, exitProgram: () => exitProgram?.() };
}

describe("TutorialShell ascii-splash integration", () => {
  it("launches ascii-splash and delegates input while it is active", () => {
    const { output, program, shell, startAsciiSplash, exitProgram } = createHarness();

    shell.handleInput("ascii-splash --no-mouse\r");
    shell.handleInput("q");

    expect(startAsciiSplash).toHaveBeenCalledWith(["--no-mouse"], expect.any(Function));
    expect(program.start).toHaveBeenCalledTimes(1);
    expect(program.handleInput).toHaveBeenCalledWith("q");

    exitProgram();
    expect(output.join("")).toContain("$ ");
  });

  it("disposes the active program with the shell", () => {
    const { program, shell } = createHarness();

    shell.handleInput("splash\r");
    shell.dispose();

    expect(program.dispose).toHaveBeenCalledTimes(1);
  });
});
