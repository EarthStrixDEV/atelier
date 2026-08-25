#!/usr/bin/env bash
# Blocks force-push and hard reset — this repo has no CI safety net beyond
# a build-and-deploy workflow (.github/workflows/deploy.yml), so a bad
# force-push to main goes straight to GitHub Pages.
input=$(cat)
command=$(echo "$input" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

if echo "$command" | grep -qE '\bgit[[:space:]]+push\b.*(--force\b|-f\b|--force-with-lease\b)'; then
  echo "Blocked: force-push. Confirm with the user first — deploy.yml ships straight to GitHub Pages off main." >&2
  exit 2
fi

if echo "$command" | grep -qE '\bgit[[:space:]]+reset\b.*--hard\b'; then
  echo "Blocked: git reset --hard discards uncommitted work. Confirm with the user first." >&2
  exit 2
fi

exit 0
