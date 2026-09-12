#!/usr/bin/env bash
# Blocks Read/Edit/Write on .env / .env.local — this repo's only secret file
# (VITE_GOOGLE_CLIENT_ID, see .env.example). Everything else here is a
# client-only SPA with no server credentials to leak.
input=$(cat)
file_path=$(echo "$input" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

if [[ "$file_path" =~ (^|/)\.env($|\.local$) ]]; then
  echo "Blocked: $file_path holds secrets (VITE_GOOGLE_CLIENT_ID). Read .env.example instead, or ask the user directly." >&2
  exit 2
fi

exit 0
