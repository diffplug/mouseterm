import { useCallback, useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import {
  getOrCreateTerminal,
  attachTerminal,
  detachTerminal,
  refitTerminal,
  focusTerminal,
} from '../lib/terminal-registry';
import { pasteFilePaths } from '../lib/clipboard';
import { getPlatform } from '../lib/platform';
import { SelectionOverlay } from './SelectionOverlay';
import { SelectionPopup } from './SelectionPopup';

interface TerminalPaneProps {
  id: string;
  isFocused?: boolean;
}

/**
 * Thin mount point for a terminal. The actual xterm.js instance lives in the
 * terminal registry and persists across React mount/unmount cycles (reparenting,
 * detach/reattach, row moves). This component just attaches/detaches the
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
    attachTerminal(id, container);

    // Resize observer — refit terminal when container changes size
    const observer = new ResizeObserver(() => refitTerminal(id));
    observer.observe(container);

    return () => {
      observer.disconnect();
      // Detach (but don't destroy) — terminal stays alive in the registry
      detachTerminal(id);
    };
  }, [id]);

  useEffect(() => {
    focusTerminal(id, isFocused);
  }, [id, isFocused]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault();
    const platform = getPlatform();
    const paths: string[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const p = await platform.saveDroppedBytesToTempFile(bytes, file.name);
      if (p) paths.push(p);
    }
    if (paths.length > 0) pasteFilePaths(id, paths);
  }, [id]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-terminal-bg"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <SelectionOverlay terminalId={id} />
      <SelectionPopup terminalId={id} />
    </div>
  );
}
