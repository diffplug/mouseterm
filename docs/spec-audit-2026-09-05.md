# Spec audit — September 5, 2026

This review covers the current implementation and paired rationale of every canonical spec except Dor Tools, deferred at the user's request until its two pending PRs merge. SELF_HOST is included as a root-level spec; SECURITY is reviewed with the security overview. Each spec received a separate agent assignment, followed by cross-spec review and integrated validation.

Thirty-one spec assignments are covered: 30 specs under `docs/specs/` plus `SELF_HOST.md`.

The changes are committed incrementally on `massive-cleanup`, starting after `acc17ade`. This is a review record, not another source of product rules.

## Results by spec

| Spec | Result |
| --- | --- |
| [SELF_HOST](../SELF_HOST.md) | Closed credential-owner and empty-DACL gaps, matched repeated config settings to service behavior, required Windows restart/rollback release identity, and preserved existing releases on staging collisions. |
| [alert](specs/alert.md) | Fixed prompt detector reset, TODO ring clearing and stale speech callbacks; restored union ownership. |
| [auto-update](specs/auto-update.md) | Validated persisted updater markers and confirmed target version before reporting success; corrected timeout/debug behavior. |
| [deploy](specs/deploy.md) | Repaired signing resumes, attested executable modes and complete file inventories; gated cached artifacts on successful release audits and removed PIN argv exposure. |
| [dor-browser](specs/dor-browser.md) | Fixed eager pane recovery and stale screenshot retries; corrected viewer lifetime and Referer direction. |
| [dor-cli](specs/dor-cli.md) | Fixed cancellation of ensure restart/integration waits and synchronous spawn validation errors; corrected handshake/ref/quoting documentation. |
| [glossary](specs/glossary.md) | Corrected identity, retained PTY, parking and staged Workspace contracts; removed duplicated union rules. |
| [layout](specs/layout.md) | Fixed duplicate Workspace identity and Door swap handling; corrected lifecycle and persistence status. |
| [mobile-terminal-ui](specs/mobile-terminal-ui.md) | Fixed IME/software keyboard handling, focus/blur intent races and mouse release across mode changes. |
| [mouse-and-clipboard](specs/mouse-and-clipboard.md) | Fixed stale popup geometry, touch selection state, Unicode cell mapping, false copy/cut success and async edit/selection races. |
| [pocket-app](specs/pocket-app.md) | Fixed size validation, rejected operations, subscription/attachment teardown races, hello cleanup, missing-passkey recovery and visible attach failure handling. |
| [relay](specs/relay.md) | Fixed idle-close routing/capacity, push sender isolation and setup token recovery; reconciled stale HTTP/framing/presence descriptions. |
| [remote-api](specs/remote-api.md) | Moved repaint restoration into PTY owner to prevent cross-viewer/local resize races; fixed attach errors, owner acknowledgements and multi-Window future contract. |
| [remote-security-model](specs/remote-security-model.md) | Made pairing authorization durable before success and serialized approval/restart; fail-closed crypto errors. |
| [security](specs/security.md) | Narrowed public guarantees to implemented boundaries and disclosed existing gaps; verified GitHub private reporting enabled. |
| [security-audit](specs/security-audit.md) | Rejected malformed/incomplete passing verdicts, propagated local failures, and aligned domain models and authentication instructions. |
| [security-ci](specs/security-ci.md) | Isolated workflow regeneration from untrusted paths; tested symlink/ignore attacks and corrected permissions and approval contracts. |
| [security-local](specs/security-local.md) | Stripped ambient proxy cookie headers, corrected exact-origin rewriting/abort cleanup, added link confirmation defense and fail-closed snapshot permissions; documented residual limits. |
| [security-remote](specs/security-remote.md) | Bounded queued relay frames before asynchronous admission and preserved ordered crypto across reconnects. |
| [security-supply-chain](specs/security-supply-chain.md) | Rejected unclassified or incorrectly excluded workspace dependency graphs and corrected runtime/disclosure claims. |
| [shortcuts](specs/shortcuts.md) | Fixed comma rename freezing command dispatch on browser/Doored Surfaces; corrected registry contexts. |
| [standalone](specs/standalone.md) | Bounded asynchronous UTF-8 log tail reads and enabled retry after failed state writes; corrected dormant persistence and quit claims. |
| [terminal-escapes](specs/terminal-escapes.md) | Retained oversized OSC framing, monotonic cross-chunk semantic timestamps and semicolon-containing OSC633 directories; corrected registry. |
| [terminal-state](specs/terminal-state.md) | Preserved native directory names, diagnostic-title separation and final command titles; fixed long/chunked alternate-screen and bracketed-paste state. |
| [theme](specs/theme.md) | Fixed malformed installed themes, color-scheme restore, dynamic palette refresh and host color precedence. |
| [tiling-engine](specs/tiling-engine.md) | Fixed weighted allocation, negative geometry, corrupt-tree validation, and fast drag/drop. |
| [transport](specs/transport.md) | Fixed corrupt browser restoration, PTY buffer caps, and child exit/replacement races. |
| [tutorial](specs/tutorial.md) | Corrected reset/key handling and WATCHING achievements; demo duration now follows live alert settings without eager desktop imports. |
| [vscode](specs/vscode.md) | Serialized host state writes and awaited durable completion before flush/teardown refresh; corrected activation and recovery claims. |
| [webgl-text](specs/webgl-text.md) | Selected the fork's core from its released peer, repaired standalone pin drift, and added offline bump regressions. |
| [website-docs](specs/website-docs.md) | Fixed list numbering/continuations, heading collision, Markdown escape parsing and shared responsive theme dismissal; corrected publishing contracts. |

## Cross-spec corrections

The review reconciled live versus staged Workspace behavior, Surface identity versus routed references, PTY-owner responsibilities, host persistence activation, and the limits of public security guarantees. Shared rules now point to their owning spec where repeated descriptions had drifted. The final pass also corrected HTTP/SSE transport descriptions, retained-PTY replay, alert deferral, shutdown barriers, and release-key scope.

## Restructuring opportunities

1. Split the Burrow service lifecycle and Settings material out of `relay.md`. Relay HTTP/routing and laptop service lifecycle have distinct implementing modules; a `burrow-service.md` spec would let both platform specs point to one runtime contract. Keep ceremony/security behavior in `remote-security-model.md`.
2. Extract parsing, stripping, replay, and shell-integration behavior from `terminal-escapes.md` into a protocol spec. The remaining escape registry can then follow AGENTS's registry-only rule and link every row to its behavior owner.
3. Separate session persistence/recovery from the adapter and PTY wire contract in `transport.md`. This would reduce repeated recovery/activation claims across layout and the two hosts.

These are recommendations. This pass applies targeted ownership corrections and preserves staged designs; it does not undertake those broad file splits.

## Validation and limits

- Root `pnpm test` passed: 3,724 tests plus specification, security, installer, and other lint/self-test gates. Final staging-directory changes received an additional focused installer check.
- Root `pnpm build` passed, including generated documentation and website prerendering. Website tests now enforce TypeScript checking.
- Focused Rust tests passed for the changed standalone behavior. Installer tests execute extracted shipped Unix helpers; Windows changes have structural lint and mutation coverage.
- Frozen dependency installation and disclosure regeneration passed without a generated dependency-inventory diff. Read-only GitHub checks confirmed scanning, push protection, vulnerability alerts, private reporting, and the reviewed environment/repository protections.
- The prose inventory covered the corpus; its advisory findings informed the ownership corrections and restructuring recommendations.

An earlier integrated run encountered one Undici WebSocket failure in the Relay expiry test. Its isolated rerun and both subsequent integrated runs passed; no reproducible product failure was established.

Two compatibility changes deserve attention: iframe-proxy cookie authentication is unsupported after stripping ambient Cookie/Set-Cookie headers, and old CI release artifacts lack the newly required executable metadata. New release tags must contain the updated workflow.

No live installation, release, deployment, or credentialed signing was performed. Native Windows installer behavior, actual iOS hardware, and the interactive VS Code development host still need their platform checks. Existing documented gaps remain in [the security overview](specs/security.md#known-gaps); this audit does not establish absence of all bugs.

