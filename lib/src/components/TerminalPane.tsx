import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import {
  getOrCreateTerminal,
  mountElement,
  unmountElement,
  refitSession,
  focusSession,
} from '../lib/terminal-registry';
import { SelectionOverlay } from './SelectionOverlay';
import { SelectionPopup } from './SelectionPopup';

interface TerminalPaneProps {
  id: string;
  isFocused?: boolean;
}

/**
 * Thin mount point for a terminal. The actual xterm.js instance lives in the
 * terminal registry and persists across React mount/unmount cycles (reparenting,
 * minimize/reattach, row moves). This component just mounts/unmounts the
 * terminal's persistent DOM element to its container.
 */
export function TerminalPane({ id, isFocused = true }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Ensure the terminal exists in the registry
    getOrCreateTerminal(id);

    // Attach the terminal's persistent element to this container
    mountElement(id, container);

    // Resize observer — refit terminal when container changes size
    const observer = new ResizeObserver(() => refitSession(id));
    observer.observe(container);

    return () => {
      observer.disconnect();
      // Unmount DOM element — registry entry and Session survive
      unmountElement(id);
    };
  }, [id]);

  useEffect(() => {
    focusSession(id, isFocused);
  }, [id, isFocused]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-b-lg bg-terminal-bg">
      <SelectionOverlay terminalId={id} />
      <SelectionPopup terminalId={id} />
    </div>
  );
}
