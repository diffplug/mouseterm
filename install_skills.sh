#!/bin/bash
set -e
cd "$(dirname "$0")"
npx skills experimental_install
mkdir -p .claude/commands
shopt -s nullglob
for skill in .agents/skills/*/; do
  name="$(basename "$skill")"
  ln -sfn "../../.agents/skills/$name" ".claude/commands/$name"
  ln -sf "../../.agents/skills/$name/SKILL.md" ".claude/commands/$name.md"
done
