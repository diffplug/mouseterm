---
name: release-notes
description: Draft release notes and recommend a version bump for the next mouseterm release by analyzing all merge commits and squash-merged PRs since the last release tag. Outputs a Keep a Changelog section ready to paste into CHANGELOG.md. Used as step 2 of the release checklist in docs/specs/deploy.md.
user-invocable: true
---

You are drafting release notes and recommending a version bump for the next mouseterm release.

## 1. Gather context

Run these commands and read their output:

```bash
git describe --tags --abbrev=0
git log $(git describe --tags --abbrev=0)..HEAD --merges --first-parent --pretty=format:'%H %s'
git log $(git describe --tags --abbrev=0)..HEAD --first-parent --pretty=format:'%H %s'
```

The second command catches true merge commits; the third catches squash-merged PRs that don't appear as merges. Deduplicate by SHA. If a commit subject contains no PR number (e.g. `(#123)` or `Merge pull request #123`), treat it as a direct push and still include it (link to the commit instead of a PR).

For each PR/commit in the range:
- Read the diff with `git show <sha>` to understand what actually changed — do not rely solely on the commit message
- Note whether it touches `standalone/`, `vscode-ext/`, `lib/`, or shared infrastructure

Also read the current version from `standalone/src-tauri/tauri.conf.json` so you can propose the next one.

## 2. Decide the version bump

mouseterm uses **breaking.added.bugfix** semantics (semver-shaped, but named for what each segment means here):

- **breaking** (major) — bump if any change breaks behavior users rely on, removes a feature, or changes a VSCode extension contribution point in an incompatible way
- **added** (minor) — bump if any change adds a new user-facing feature, with no breaking changes
- **bugfix** (patch) — bump only if all changes are bug fixes, docs, internal refactors, or dependency bumps

Pick the highest-severity bump that any single change requires.

## 3. Output

Write the result as a Keep a Changelog block ready to paste into `CHANGELOG.md`, in this exact shape:

```markdown
## [X.Y.Z] - YYYY-MM-DD

_Recommended bump: **<breaking|added|bugfix>** — <one-sentence justification naming the change that drives it>._

### Added
- [standalone] Short user-facing summary ([#123](https://github.com/diffplug/mouseterm/pull/123))
- [vscode] ...
- [both] ...

### Changed
- ...

### Fixed
- ...
```

Rules for the entries:
- One line per PR, written in user-facing terms (not "refactored X" — say what the user sees)
- Tag each entry with `[standalone]`, `[vscode]`, or `[both]` based on which artifact ships the change
- Link the PR using `https://github.com/diffplug/mouseterm/pull/<N>`. For direct-push commits with no PR, link the commit instead: `https://github.com/diffplug/mouseterm/commit/<sha>`
- Omit any of Added / Changed / Fixed if it would be empty
- Use today's date (`YYYY-MM-DD`) and the recommended `X.Y.Z`

After printing the block, remind the user:

> Review and edit, then paste into `CHANGELOG.md` (replacing the `[Unreleased]` section) and run `./scripts/bump-version.sh X.Y.Z` with the recommended version.
