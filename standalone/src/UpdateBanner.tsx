import { XIcon } from '@phosphor-icons/react';

export type UpdateBannerState =
  | { status: 'idle' }
  | { status: 'downloaded'; version: string }
  | { status: 'dismissed' }
  | { status: 'post-update-success'; from: string; to: string }
  | { status: 'post-update-failure'; version: string };

interface UpdateBannerProps {
  state: UpdateBannerState;
  onDismiss: () => void;
  onOpenChangelog: () => void;
}

export function UpdateBanner({ state, onDismiss, onOpenChangelog }: UpdateBannerProps) {
  if (state.status === 'idle' || state.status === 'dismissed') return null;

  let message: string;
  let showChangelog = false;

  switch (state.status) {
    case 'downloaded':
      message = `Update downloaded (v${state.version}) \u2014 will install when you quit.`;
      showChangelog = true;
      break;
    case 'post-update-success':
      message = `Updated to v${state.to} \u2014 from v${state.from}.`;
      showChangelog = true;
      break;
    case 'post-update-failure':
      message = `Update to v${state.version} failed \u2014 will retry next launch.`;
      break;
  }

  return (
    <span className="flex items-center gap-1.5 pb-1 text-sm font-mono tracking-[0.06em] text-muted">
      <span className="truncate">{message}</span>
      {showChangelog && (
        <button
          onClick={onOpenChangelog}
          className="shrink-0 hover:underline"
          style={{ color: 'var(--vscode-textLink-foreground)' }}
        >
          Changelog
        </button>
      )}
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
