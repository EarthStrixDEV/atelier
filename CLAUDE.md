# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelier is an AI image generator web app backed by OpenRouter. The entire application lives in a single file, `index.html` — inline CSS and vanilla JS (an IIFE, no framework, no build step, no dependencies, no tests). UI text is Thai; code identifiers are English.

To run it, just open `index.html` in a browser (or serve it statically). There are no build, lint, or test commands.

## Architecture of index.html

Everything hangs off a single `state` object inside the IIFE (`apiKey`, `models`, `ratio`, `count`, `images`, `lbIndex`, `seq`). UI updates flow through one `render()` function that rebuilds the whole gallery grid from `state.images` — there is no incremental DOM patching, so mutate state then call `render()`.

Key flows:

- **API key** — kept in memory only (never persisted to localStorage or elsewhere, by design; see the note in the key modal). The key modal auto-opens on load if empty.
- **Model list** — fetched live from `https://openrouter.ai/api/v1/models`, filtered to models whose `architecture.output_modalities` includes `"image"`. The `PREFERRED` regex array floats specific models (grok imagine, gpt image) to the top of the dropdown.
- **Generation** — POSTs to OpenRouter's `chat/completions` endpoint with `modalities: ["image", "text"]`; the image comes back as `choices[0].message.images[0].image_url.url` (a data URL). Non-1:1 aspect ratios are sent both via `image_config.aspect_ratio` and appended to the prompt as a hint, since not all models honor `image_config`. Each image in a batch is an independent request with its own loading/error card and retry.

Styling uses CSS custom properties defined in `:root` (dark theme). Follow the existing variables (`--bg`, `--surface`, `--border`, `--accent`, `--radius`, etc.) rather than hardcoding colors.
