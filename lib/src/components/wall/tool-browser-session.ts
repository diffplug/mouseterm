import type { PlatformAdapter } from '../../lib/platform/types';
/** The host capabilities this module needs — the same two the CLI path leans
 *  on, narrowed so tests can stub them without a full adapter. */
type ConnectPlatform = Pick<PlatformAdapter, 'agentBrowserCommand' | 'agentBrowserStreamStatus'>;

export type ConnectPortResult = { ok: true } | { ok: false; message: string };

/**
 * Open `url` in `session` and hand `surfaceId` the resulting `{session, wsPort,
 * binaryPath}` as one params write for the tool serving trigger.
 *
 * The surface gets its `session` whether or not the open succeeded, so a failed
 * pane's placeholder names the session instead of sitting session-less.
 */
export async function attachAgentBrowserSession({
  url,
  platform,
  session,
  binaryPath,
  surfaceId,
  refreshSurface,
}: {
  url: string;
  platform: ConnectPlatform;
  session: string;
  binaryPath?: string;
  surfaceId: string;
  refreshSurface: (surfaceId: string, patch: Record<string, unknown>) => void;
}): Promise<ConnectPortResult> {
  if (!platform.agentBrowserCommand) {
    return { ok: false, message: 'opening a browser surface is not supported on this host' };
  }
  // 'open' is on the host's subcommand allowlist; the CLI boots the daemon/browser
  // if it isn't already running.
  const opened = await platform.agentBrowserCommand(session, ['open', url], binaryPath);
  if (opened.exitCode !== 0) {
    refreshSurface(surfaceId, { session });
    return { ok: false, message: opened.stderr.trim() || `agent-browser open exited ${opened.exitCode}` };
  }
  // Best-effort stream port so the panel connects straight to the live screencast;
  // if it's absent or stale the panel recovers it later, so a miss is non-fatal.
  let wsPort: number | undefined;
  if (platform.agentBrowserStreamStatus) {
    const status = await platform.agentBrowserStreamStatus(session, binaryPath);
    if (status.ok) wsPort = status.wsPort;
  }
  // Setting `session` connects the controller (the daemon is up now, so its
  // recovery is safe to run).
  refreshSurface(surfaceId, {
    session,
    ...(wsPort !== undefined ? { wsPort } : {}),
    ...(binaryPath !== undefined ? { binaryPath } : {}),
  });
  return { ok: true };
}
