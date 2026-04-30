import { XIcon } from '@phosphor-icons/react';

export type UpdateBannerState =
  | { status: 'idle' }
  | { status: 'downloaded'; version: string }
  | { status: 'dismissed' }
  | { status: 'post-update-success'; from: string; to: string }
  | { status: 'post-update-failure'; version: string; error?: string };

interface UpdateBannerProps {
  state: UpdateBannerState;
  onDismiss: () => void;
  onOpenChangelog: () => void;
  onOpenDebug: () => void;
}

const linkClass = 'shrink-0 hover:underline';
const linkStyle = { color: 'var(--vscode-textLink-foreground)' };

export function UpdateBanner({ state, onDismiss, onOpenChangelog, onOpenDebug }: UpdateBannerProps) {
  if (state.status === 'idle' || state.status === 'dismissed') return null;

  let message: string;
  let link: { label: string; onClick: () => void };

  switch (state.status) {
    case 'downloaded':
      message = `Update downloaded (v${state.version}) — will install when you quit.`;
      link = { label: 'Changelog', onClick: onOpenChangelog };
      break;
    case 'post-update-success':
      message = `Updated to v${state.to} — from v${state.from}.`;
      link = { label: 'Changelog', onClick: onOpenChangelog };
      break;
    case 'post-update-failure':
      message = 'Update failed.';
      link = { label: 'Click here to debug', onClick: onOpenDebug };
      break;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }

  return (
    <span className="flex items-center gap-1.5 pb-1 text-sm font-mono text-muted">
      <span className="truncate">{message}</span>
      <button onClick={link.onClick} className={linkClass} style={linkStyle}>
        {link.label}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 hover:bg-foreground/10 hover:text-foreground"
        aria-label="Dismiss"
      >
        <XIcon size={10} />
      </button>
    </span>
  );
}
