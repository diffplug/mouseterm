# Terminal context

> Status: design — the production context and helper are not implemented. The
> existing visual prototype is owned by `docs/specs/layout.md` → Terminal context prototype.
>
> See `docs/specs/glossary.md` for Surface / Session / Pane vocabulary.
> This design owns helper lifecycle and context composition; layout, terminal
> semantics, alerts, transport, and browser behavior retain their existing owners.

## Future

**Scope: terminal-context** — implement after resolving the questions below:

1. Settle ownership and lifecycle contracts, update the owning specs, and add host metadata.
2. Build helper session management, input ownership, reset, promotion, and recovery.
3. Replace production terminal menus and connect metadata, alerts, directory, and port actions.
4. Replace static stories with shared production presentation, verify both desktop hosts, and promote completed rules above the fold.

### Context composition

- **Must use one context for terminal-capable Surfaces**, reached from the header, header alert, terminal body, and existing keyboard context command. Browser-only Surfaces retain their applicable controls.
- **Must anchor below the source header at the terminal body's top-left**, reserving the prototype's two-rem right and bottom gaps where space permits. Keep the overlay within the available body; small-screen redesign is deferred.
- **Must retain the approved prototype's rows, labels, subdued action treatment, compact switches, and single-line helper header.** The helper name yields space before its status and actions.
- **Must show the source's stable Surface ref on the Title row**, with copy and close affordances and no separate context heading.
- **Must explain the displayed title using the same derivation as the header.** Include the winning candidate, user override, command fallback, and latest relevant OSC candidates; do not invent a historical OSC log.
- **Must keep title, directory, and alerts current while open.** Ports are the exception: take one scan per opening and ignore late results after close or source change.
- **Must render alert notifications directly and retain existing attention, Watch, and TODO semantics.** Existing alert actions that open terminal details open this context; actions that acknowledge or toggle retain their behavior.
- **Must retain terminal selection copy/paste affordances without adding a clipboard toolbar to this context.** Right-click ownership in reporting applications is Q6.
- **Must keep one context open per Wall**, with nested settings/title disclosures belonging to that context. Switching source hides the previous helper under its normal lifecycle.

### Directory and ports

- **Must copy the absolute directory and abbreviate only the current user's home prefix for display.** Use path boundaries, platform path syntax, and directory host identity; do not guess home from path segments.
- **Must open directories through a dedicated platform capability**, with local absolute-directory validation, argument-safe process invocation, and visible failure feedback. Do not widen the external-URL opener to accept arbitrary file URLs. Unsupported or remote directories need an explanation rather than an inert action.
- **Must launch a new helper with the configured shell and a supported local source directory.** It does not inherit the source shell's exports, virtual environment, or SSH connection. Q5 settles the unavailable/remote-directory interaction.
- **Must show a prominent directory mismatch warning with both Helper and Parent locations.** A preserved helper never silently follows a parent directory change; unknown location is distinct from a confirmed match.
- **Must distinguish scanning, no ports, and scan failure.** Deduplicate and order ports using existing port URL rules; show the address and process when known.
- **Must show four labeled actions for the selected port**: System browser, Iframe, Agent browser, and Popout. One port needs no selector; multiple ports put their count beside the selector before the actions.
- **Must preserve the source when opening a port.** The existing browser-launch path's replacement of untouched terminals is inappropriate here. Disable unavailable capabilities with a reason; report launch failures in context. Q7 settles reuse.

### Helper lifecycle

- **Must create at most one helper per source, lazily on first opening.** Opening the parent terminal itself creates no helper. A helper cannot recursively acquire a helper.
- **Must keep the global autorun setting separate from per-helper state.** Factory default is `git status`; an empty command disables autorun. Settings changes affect new/reset helpers, and the status reports the command that this helper actually used.
- **Must wait for positively established shell readiness before injecting autorun.** Cancel pending injection on user input, reset, disposal, or promotion; never inject on an elapsed-time guess. Missing integration shows a skipped/unsupported state. Treat each launch as a separate generation so stale callbacks cannot write into its replacement.
- **Must make user input permanently preserve that helper until Reset or Promote.** Typing, paste, accepted drops, program mouse input, and explicit external writes count; selection, copying, resize, and protocol replies do not. An idle prompt does not restore automatic behavior.
- **Must refresh an untouched helper on reopening only when safely idle.** Preserve running autorun, foreground applications, background jobs, and uncertain process state. Prompt completion alone does not prove no background work remains.
- **Must hide preserved helpers when the context closes without killing or suspending their processes.** Keep scrollback, partial input, working directory, and terminal modes. Dispose an untouched, completed helper only after establishing the same safe-idle condition used for refresh.
- **Must make Reset explicitly discard the old helper and restore automatic behavior in a fresh helper.** Confirm before discarding user work or running/uncertain processes, naming the running command when known. Leave the existing helper intact if reset is cancelled.
- **Must make Promote transfer the actual Session into a regular split beside the source**, retaining its PTY, xterm instance, scrollback, directory, input, and identity. Close the context and focus the promoted terminal. Commit ownership transfer only after placement succeeds; failure leaves the helper usable. A subsequent source context gets a fresh helper.
- **Must let an exited helper retain its visible output**, with Reset available and no repeated automatic restart loop.

| State | Single-line status and action |
|---|---|
| Awaiting readiness | Waiting for shell…; Modify |
| Autorun executing | Running `command`…; Modify |
| Untouched, completed | `command` autoran; Modify |
| User input received | Skipping autorun to preserve user keystrokes; Reset |
| Autorun disabled | Autorun off; Modify |
| Readiness unavailable | Autorun skipped: shell readiness unavailable; Modify |
| Launch failed / exited | Concrete error / exit status; Reset |

### Identity, focus, and host lifetime

- **Must model the helper as an explicitly owned auxiliary terminal Surface**, with a stable Session id and source association, rather than a fabricated minimized Pane. Its source Pane contains both; only the primary Surface has a Lath leaf until promotion. Update glossary identity/containment language and registry parking rules before relying on this exception. This does not introduce tabs or the staged workspace rollout.
- **Must separate session management from React overlay lifetime.** Keep retained xterm DOM in a mounted parking container when hidden; attach the same element when revealed or promoted. Overlay cleanup alone must never call Session disposal.
- **Must carry helper ownership in host live-PTY metadata before reconnect reconciliation.** Otherwise current orphan recovery treats a helper as a normal Pane and may discard the saved layout. Validate ownership within the owning Workspace and reconcile parent/helper restoration together.
- **Must retain the executed-command snapshot and sticky preservation state across live reconnects.** If that state cannot be recovered, preserve the helper and disarm autorun rather than infer that it was untouched. Promotion removes auxiliary ownership in the host as well as the frontend.
- **Must preserve helpers across reconnections that retain their PTYs**, including webview recreation. Cold starts follow each host's existing recovery contract with a fresh lazy helper; do not add standalone disk session persistence or promise saved editor buffers after process death. Missing-parent recovery must retain live user work in a regular Pane rather than silently dispose it.
- **Must route keyboard and clipboard input to the actual focused terminal.** While helper xterm owns focus, Escape, Tab, arrows, and digits belong to its program; global selection handling must not intercept them for the parent. Escape from context controls closes the innermost disclosure, then context. Outside click and explicit close hide the context. Opening focus is Q1.
- **Must restore source focus on close unless the user selected another target.** Source minimize hides context and retains its helper; destructive source closure follows Q2.
- **Must account for helper processes in host shutdown checks and resource cleanup.** Hidden work cannot bypass existing quit protection. Alert and external-discovery behavior are Q3 and Q4.

### Questions for product decisions

These recommendations are provisional, not settled behavior.

| ID | Decision | Recommendation |
|---|---|---|
| Q1 | Where does focus land when opening? | Focus the helper immediately; input during startup cancels pending autorun. |
| Q2 | Close a parent with preserved or running helper work? | Offer Keep helper (take the parent's slot), Close both, or Cancel. Safely untouched helpers need no extra confirmation. |
| Q3 | What happens when a hidden helper needs attention? | Reflect its attention on the parent with a helper indicator; activating it reveals the helper. Keep source and helper Watch/TODO state distinct. |
| Q4 | Is an unpromoted helper discoverable outside its context? | Let `dor` identify/address it, label it as the parent's helper in listings, and make focus reveal its context. Defer Pocket access until promotion; filter both directory discovery and direct attachment. |
| Q5 | Source directory is remote or unavailable? | Show the fallback local directory and require an explicit Start locally action before spawning or autorunning. Copy the source path remains available. |
| Q6 | Right-click while a terminal application owns mouse input? | Preserve the application's right-click; Shift-right-click opens context. Header right-click always opens context. |
| Q7 | Repeated port action creates or reuses a browser? | Reuse per source and port; iframe has its own Surface, Agent browser and Popout share one agent-browser session and change its display mode. System browser follows OS behavior. |

**Proposed delivery scope:** VS Code and Standalone desktop, plus working fake-adapter Storybook/demo coverage. Pocket composition and remote helper creation are deferred; existing terminal-only remote protocol remains unchanged.

### Implementation map

This map identifies existing integration points, not implemented feature ownership. Add dedicated context presentation, helper-session controller, and global-settings modules alongside these files during implementation.

| Area | Integration points and required work |
|---|---|
| Composition | `lib/src/components/Wall.tsx`; `lib/src/components/wall/TerminalPanel.tsx`; `lib/src/components/wall/TerminalPaneHeader.tsx`; `lib/src/components/wall/PaneHeaderContextMenu.tsx`; `lib/src/components/TodoAlertDialog.tsx`: central context state, entry points, alert integration, safe split adoption. Retire only superseded terminal paths. |
| Lifecycle/input | `lib/src/lib/terminal-lifecycle.ts`; `lib/src/lib/terminal-store.ts`; `lib/src/components/wall/use-wall-keyboard.ts`: observable helper state, cancellable readiness, input-origin tracking, DOM parking, focus routing. Audit every PTY write path. |
| Metadata/browser | `lib/src/lib/terminal-state.ts`; `lib/src/components/wall/port-url.ts`; `lib/src/components/wall/connect-port.ts`: shared title explanation, host-aware directories, scan snapshot, four launch modes, source-preserving placement. |
| Adapters/hosts | `lib/src/lib/platform/types.ts`; `lib/src/lib/platform/vscode-adapter.ts`; `lib/src/lib/platform/fake-adapter.ts`; `vscode-ext/src/pty-manager.ts`; `vscode-ext/src/message-types.ts`; `standalone/src/tauri-adapter.ts`; `standalone/sidecar/pty-core.js`; `standalone/src-tauri/src/lib.rs`: directory capability, home identity, helper ownership, safe-idle evidence, promotion metadata updates, ownership validation across bridges. |
| Settings/recovery | `lib/src/lib/alert-settings-host.ts` as the existing global synchronization pattern; `lib/src/lib/reconnect.ts`; `lib/src/lib/session-save.ts`; `lib/src/lib/session-types.ts`: separate autorun setting, atomic live ownership recovery, backward-compatible metadata defaults, existing cold-start policies. |
| External surfaces | `lib/src/components/wall/use-dor-control.ts`; `dor/src/commands/types.ts`; `lib/src/remote/burrow/directory-collect.ts`; `lib/src/remote/burrow/remote-api.ts`: helper addressing, focus/kill semantics, remote discovery and attachment guards according to Q4. Audit alert unions and shutdown counts alongside these consumers. |
| Stories | `lib/src/stories/TerminalContext.stories.tsx`: use production presentation with deterministic fake sessions and controllable metadata, process, and capability states. |

### Spec changes and validation

- **Must update each behavior's owning spec in the same implementation slice.** This spec owns lifecycle; glossary owns auxiliary identity/containment, layout owns placement/focus/promotion, mouse-and-clipboard owns right-click/input routing, terminal-state owns title/readiness/directory semantics, alert owns helper attention, transport owns live metadata/recovery, dor-cli owns addressing, dor-browser owns reuse, and host specs own native operations/settings. Security-local and security-remote own new trust-boundary guarantees; update audited checks only when those guarantees change.
- **Must replace the layout prototype-only rule when production integration ships**, keeping presentation ownership in layout and lifecycle here. Promote completed text out of this scope; leave only unbuilt design under Future.
- **Must test lifecycle transitions and races**: first open, safe refresh, user input before readiness, running/background work, unknown readiness, hide/reopen, reset cancellation, stale callbacks, exit, exact-session promotion, failed placement, parent closure, and live reconnect with helpers. Use controllable fake PTYs and readiness signals.
- **Must test boundary behavior**: native directory validation and errors, home/path identity, async source changes, each port mode and reuse, alert isolation, all user-input routes, helper CLI ownership, and denied remote direct attachment. Add host tests where bridge fields or recovery behavior change.
- **Must verify real shells in both desktop hosts**: initial autorun, typed partial input, preserved scrollback, unsaved `nano`, a background job, missing shell integration, clipboard and application mouse reporting, source-directory changes, promotion, and webview reload. View the implemented stories through `dor ab` in light and dark themes.
- **Must run spec lint, relevant focused tests, root tests, type/build checks, and the production build before completion.** Keep Storybook states for zero/one/multiple ports, notifications, all helper states, directory mismatch/unknown, failed capabilities, and nested disclosures.
