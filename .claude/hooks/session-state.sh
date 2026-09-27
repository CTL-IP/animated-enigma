#!/usr/bin/env bash
# SessionStart — orientation.
#
# This build runs across many sessions, and each one starts cold: the container
# is fresh, the context is empty, and the first thing I do is usually spend tool
# calls rediscovering where things stand. This answers that in one shot.
#
# Deliberately facts only — branch, working state, migration count, open items.
# No advice; the skills carry that.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$root" ] && [ -d "$root" ] || exit 0
cd "$root" || exit 0

DESIGNATED="claude/loving-pasteur-hyl6er"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
dirty_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
last_commit="$(git log -1 --format='%s' 2>/dev/null | cut -c1-72)"
latest_migration="$(ls drizzle/*.sql 2>/dev/null | sed 's|drizzle/||' | sort | tail -1)"
migration_count="$(ls drizzle/*.sql 2>/dev/null | wc -l | tr -d ' ')"

# Settle what there is to compare against before counting anything unpushed.
# `@{u}..HEAD` with no upstream is an error, and an error piped into wc reads
# as zero: that printed "everything pushed" for a branch never pushed at all.
# Remote refs are whatever this clone last saw; a session-start hook stays off
# the network.
push=""
if [ "$branch" = "HEAD" ]; then
  push="detached HEAD, no upstream"
elif git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  unpushed="$(git log --oneline '@{u}'..HEAD 2>/dev/null | wc -l | tr -d ' ')"
  [ "$unpushed" != "0" ] && push="$unpushed unpushed"
elif upstream_ref="$(git config --get "branch.$branch.merge")"; then
  # Configured but unresolvable: the remote branch was deleted, usually after a merge.
  push="upstream $(git config --get "branch.$branch.remote" || echo origin)/${upstream_ref#refs/heads/} is gone"
elif git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null; then
  # An origin/ copy of the branch exists but nothing tracks it: pushed without
  # -u, or made when the clone was set up — which can place it at the base
  # commit when GitHub has no such branch. Either way it is the baseline.
  push="no upstream set, $(git rev-list --count "origin/$branch..HEAD") unpushed vs origin/$branch"
else
  push="never pushed — no upstream"
  if ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null)"; then
    push="$push ($ahead commit$([ "$ahead" = 1 ] || echo s) ahead of origin/main)"
  fi
fi

lines=()
lines+=("PT's Tactical Foreman — session start")
lines+=("")

if [ "$branch" = "$DESIGNATED" ]; then
  lines+=("branch:      $branch")
else
  lines+=("branch:      $branch  ⚠ NOT the designated branch ($DESIGNATED)")
fi

lines+=("last commit: $last_commit")

state=""
[ "$dirty_count" != "0" ] && state="$dirty_count uncommitted"
if [ -n "$push" ]; then
  [ -n "$state" ] && state="$state, "
  state="$state$push"
fi
lines+=("working:     ${state:-clean, everything pushed}")
lines+=("migrations:  $migration_count files, latest $latest_migration")
# A re-provisioned container once cloned the wrong base branch and pointed the
# designated branch name at a Task-7-era tree with 2 migrations. The count is the
# cheapest tell there is, so refuse to let it pass quietly.
if [ "${migration_count:-0}" -lt 40 ]; then
  lines+=("")
  lines+=("⚠ TREE LOOKS WRONG: only $migration_count migrations here; the real branch carries 43+.")
  lines+=("  Do not build on this. First: git fetch origin $DESIGNATED")
  lines+=("  then compare: git log --oneline -1 origin/$DESIGNATED")
fi
lines+=("")
lines+=("Blocked on Patrick: cost rates per person (margins are meaningless until set);")
lines+=("email delivery (needs an API key); attorney review of the contract terms.")
lines+=("")
lines+=("CLAUDE.md has the rules and conventions. Skills: domain-slice, db-change, ship-check.")

body="$(printf '%s\n' "${lines[@]}")"

jq -n --arg c "$body" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $c
  }
}'
exit 0
