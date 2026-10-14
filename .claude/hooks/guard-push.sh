#!/usr/bin/env bash
# PreToolUse / Bash — branch protection.
#
# "Never push to a different branch without explicit permission" is a standing
# instruction from Patrick, and until now it was enforced only by my remembering
# it. A push to main or to someone else's branch is not something you undo
# cleanly, so it gets a real gate.
#
# Blocks: any `git push` to main or to a branch that is neither listed in
# designated-branch nor the session's own `claude/*` branch, and any
# force-push. Allows everything else through untouched.
#
# Why "the session's own claude/* branch" and not only the list: every session
# is handed a fresh `claude/<slug>` branch by the host, so a single pinned name
# blocked everyone but one session — and the guard got switched off entirely
# (PR #9) rather than repointed yet again. The branch you are standing on is
# the one you were given. `main` is never a claude/* branch, so the deny that
# matters survives; reaching another session's branch takes a deliberate
# checkout first, not a reflex.
set -uo pipefail

# Branches cleared for pushing, one per line, read by this hook and by
# session-state.sh. Blank lines and `#` comments are ignored.
DESIGNATED_FILE="$(dirname "${BASH_SOURCE[0]}")/designated-branch"
DESIGNATED="$({ grep -vE '^[[:space:]]*(#|$)' "$DESIGNATED_FILE" | tr -d ' \t\r' | tr '\n' ' '; } 2>/dev/null)"
DESIGNATED="${DESIGNATED% }"

payload="$(cat 2>/dev/null || echo '{}')"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null)"

# Not a push — nothing to say. Cursor requires JSON on stdout even when allowing.
if ! printf '%s' "$cmd" | grep -qE '(^|[;&|]|\s)git\s+push\b'; then
  printf '%s\n' '{}'
  exit 0
fi

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

if [ -z "$DESIGNATED" ]; then
  deny "Blocked: .claude/hooks/designated-branch is missing or empty, so no branch is cleared for pushing.

Tell Patrick, and ask which branch this work should go to."
fi

# Force-pushing discards history that may already be on the PR. There are
# legitimate reasons (restarting from a merged base), but it should be a
# deliberate ask, not a reflex.
if printf '%s' "$cmd" | grep -qE '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  deny "That is a force-push. It discards remote history that may already be on its pull request.

If you genuinely need it — restarting the branch from a merged base is the usual reason — say so to Patrick and get explicit agreement first, then run it."
fi

# Find the branch being pushed. `git push -u origin <branch>` or `git push origin <branch>`.
target="$(printf '%s' "$cmd" \
  | grep -oE 'git[[:space:]]+push[^;&|]*' \
  | sed -E 's/.*(origin|upstream)[[:space:]]+([^[:space:];&|]+).*/\2/' \
  | head -1)"

current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

# A bare `git push` follows the tracking branch. Judge it by the branch we are
# standing on rather than assuming it is cleared — standing on main is exactly
# the case this hook exists for.
if [ -z "$target" ] || printf '%s' "$target" | grep -qE '^git|push$'; then
  target="$current"
fi

# Strip any refspec form (HEAD:branch, branch:branch).
target="${target##*:}"

allowed=0
for b in $DESIGNATED; do
  [ "$target" = "$b" ] && allowed=1
done
if [ "$allowed" -eq 0 ] && [ -n "$current" ] && [ "$target" = "$current" ] \
   && printf '%s' "$target" | grep -qE '^claude/'; then
  allowed=1
fi

if [ "$allowed" -eq 0 ]; then
  deny "Blocked: this pushes to '$target', which is neither a cleared branch nor this session's own claude/* branch.

Cleared branches (.claude/hooks/designated-branch):
    $DESIGNATED
This checkout is on:
    ${current:-unknown}

  Pushing elsewhere — main especially — needs Patrick's explicit permission first. If he has given it in this conversation, tell him the hook blocked it and ask him to confirm, rather than working around it."
fi

printf '%s\n' '{}'
exit 0
