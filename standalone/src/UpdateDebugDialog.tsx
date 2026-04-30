import { useEffect, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { openIssueSearch, openNewIssue } from './updater';

interface UpdateDebugDialogProps {
  open: boolean;
  onClose: () => void;
  failure: { version: string; error?: string };
  body: string | null;
}

export function UpdateDebugDialog({ open, onClose, failure, body }: UpdateDebugDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch (e) {
      console.error('[updater] Failed to copy report:', e);
    }
  };

  const errorPreview = failure.error ?? '';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto max-h-[80vh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface-raised p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface-raised px-4 py-3">
        <span className="text-sm font-medium">Update failed</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <XIcon size={14} weight="bold" />
        </button>
      </div>

      <div className="space-y-4 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm">
            We couldn't install v{failure.version}. The error was:
          </p>
          <pre className="max-h-32 overflow-auto rounded border border-border bg-app-bg p-2 text-xs font-mono whitespace-pre-wrap break-words">
            {errorPreview || '(no error captured)'}
          </pre>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">1. Search existing reports</p>
          <p className="text-xs text-muted">
            Someone may have already hit this — a quick search saves a duplicate report.
          </p>
          <button
            type="button"
            onClick={() => openIssueSearch(errorPreview)}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/10"
            style={{ color: 'var(--vscode-textLink-foreground)' }}
          >
            Search GitHub issues →
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">2. File a new bug</p>
          <p className="text-xs text-muted">
            Copy this report, then paste it into the new issue page.
          </p>
          <textarea
            readOnly
            value={body ?? 'Gathering diagnostic info…'}
            className="block h-48 w-full resize-y rounded border border-border bg-app-bg p-2 text-xs font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!body}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/10 disabled:opacity-50"
            >
              {copied ? 'Copied!' : 'Copy report'}
            </button>
            <button
              type="button"
              onClick={openNewIssue}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-foreground/10"
              style={{ color: 'var(--vscode-textLink-foreground)' }}
            >
              Open new issue →
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
