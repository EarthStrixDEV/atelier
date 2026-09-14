<div align="center">

<img src="public/assets/atelier-logo.png" alt="Atelier logo" width="112" />

# Atelier

### The AI Media Studio for images, video, music, and speech in one place

Pick a model from OpenRouter · Refine prompts systematically · Compare results · Store your work right from the browser

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=fff)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=fff)](https://tailwindcss.com/)
[![OpenRouter](https://img.shields.io/badge/Powered_by-OpenRouter-6366F1)](https://openrouter.ai/)

[Getting Started](#-getting-started) · [Key Features](#-key-features) · [Project Structure](#-project-structure) · [Privacy](#-data--privacy)

</div>

---

## ✨ What is Atelier

Atelier is a client-only web app for generative media work that brings the whole workflow — drafting prompts, picking a model, generating, comparing, and finally downloading and storing files — into a single screen. The app talks to OpenRouter directly from the browser, so there's no backend of its own.

| Route | Purpose |
|---|---|
| `/` | Landing page and product overview |
| `/studio` | The workspace for creating and managing media across all 6 modes |
| `/models` | Model Catalog for comparing pricing, specs, and best-fit use cases per model |

## 🎛️ 6 Media Modes

| Mode | Output | Best for |
|---|---|---|
| **General** | Still image | Portraits, product shots, artwork, and general imagery |
| **Infographic** | Data-driven still image | Timelines, comparisons, stat grids, and bilingual graphics |
| **Video** | 720p video | Short text-to-video or image-to-video clips, depending on model capability |
| **Cinematic** | Scene-chained video | Continuous scenes built from the previous clip's frame |
| **Audio** | Music/audio clips | Music generation using Lyria-family models |
| **TTS** | Speech | Turns scripts into speech via Gemini TTS with voice options |

Each mode keeps its own prompt, model, settings, queue, history, and gallery. You can switch modes mid-generation without results landing in the wrong gallery.

## 🚀 Key Features

### Generation with fine-grained control

- Loads model lists and capabilities from OpenRouter, with curated fallbacks for key models
- Choose aspect ratios `1:1`, `4:3`, `3:4`, `16:9`, and `9:16`
- Generate batches of 1, 2, 4, or 6 at a time, plus a Multi-Prompt Queue holding up to 5 entries
- Caps concurrent in-flight requests at 4 so the browser doesn't fire off too many at once
- Attach Reference, Style, and Facial reference images — up to 2 per type, 4 MB max each — when the model supports them
- Negative prompt support in General and Infographic modes
- Cancel pending or in-progress jobs, and retry only the ones that failed

### Prompt workflow from idea to ready-to-generate

- **Prompt Builder** — keywords organized by style, lighting, camera, mood, and continuity
- **Templates** — ready-made templates, plus up to 20 personal templates saved per mode
- **Prompt Optimizer** — AI expands your prompt and suggests keywords you can pick from
- **Chat with Atelier** — a prompt assistant that gives advice tailored to your current mode
- **Grill me** — a 6–10 question interview that crystallizes your answers into several prompt variants
- **Prompt History** — keeps 30 entries per mode, with pinning and a cross-mode history view

### Compare, refine, and manage your work

- **Bake-off** — send the same prompt to up to 4 models at once, with a cost breakdown before you confirm
- **Compare** — compare 2–4 images, including swipe compare for 2
- **Refine / Start from** — take an existing result further, or use it as a starting frame for video
- **TimeFrame & Extend** — pick a frame from the timeline to build the next Cinematic scene
- **Auto Extend** — automatically grabs a clip's last frame and continues into a new scene
- Multi-select for downloading or uploading to Google Drive, with favorites and filters
- Lightbox for previewing, playing, and downloading full-size files
- Generate a share card from your work, right in the browser

### Cost protection and recovery

- Shows an estimated cost for each job based on available pricing data
- **Spend Guard** sets a cumulative spend cap and asks for confirmation before firing a batch that would exceed it
- Tracks pending jobs to try to reconcile async work after a reload
- Autosaves a session snapshot every 30 seconds, with a Restore Banner when a recoverable session is found
- Export / Import a session as `.json`, with Replace and Merge modes and a preview before importing

> [!IMPORTANT]
> Prices shown are estimates from model metadata, not receipts or actual charges from OpenRouter. Jobs already submitted to the provider may still be billed even if cancelled on the browser side.

## 🏁 Getting Started

### Prerequisites

- Node.js `22.12` or later
- npm and an OpenRouter API key

```bash
git clone https://github.com/EarthStrixDEV/atelier.git
cd atelier
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and enter an API key in the form `sk-or-v1-…` in the API Key dialog, or create one at [OpenRouter Keys](https://openrouter.ai/keys).

### Environment variables

Create `.env.local` if you want to enable Google Drive support:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

This variable is optional — if it's not set, the Google Drive button simply won't appear. The OpenRouter API key is entered through the UI and is never stored in an environment file.

## 📜 Common Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check with TypeScript, then produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally for testing |

The project doesn't yet have a lint or automated test script in `package.json`.

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd> | Generate with current settings |
| <kbd>1</kbd>–<kbd>6</kbd> or <kbd>Alt</kbd> + <kbd>1</kbd>–<kbd>6</kbd> | Switch modes, General → TTS |
| <kbd>/</kbd> | Focus the prompt field |
| <kbd>Shift</kbd> + <kbd>?</kbd> | Toggle the shortcuts overview |
| <kbd>←</kbd> / <kbd>→</kbd> | Navigate results in the Lightbox |
| <kbd>Esc</kbd> | Close a modal, panel, or the Lightbox |

## 💾 Storage & Export

| Method | Location | Behavior |
|---|---|---|
| Gallery Persistence | IndexedDB | Opt-in; up to 60 items per mode, 500 MB total, 80 MB max per item |
| Auto Save | Local folder | Uses the File System Access API; permission must be granted per the browser's rules |
| Google Drive | `Atelier Output` | Uses the `drive.file` OAuth scope; the app can only access files it created |
| Export Session | `.json` file | Backs up settings, prompts, queue, and metadata; media files are not embedded |
| Download | User's device | Direct download of a single result or multiple selected ones |

> [!NOTE]
> Auto Save works best on Chrome, Edge, and other Chromium browsers that support `showDirectoryPicker`. Other browsers can still use Download as usual.

## 🔐 Data & Privacy

- The app has no backend of its own — generation requests go straight from the browser to OpenRouter
- By default, the API key is kept in `sessionStorage`, so it survives a refresh but is cleared when the tab closes; users can opt in to remembering it in `localStorage`
- Prompt history, templates, favorites, settings, the spend ledger, and session snapshots are stored in `localStorage`
- Gallery files are stored in IndexedDB only when Gallery Persistence is enabled
- Reference images and media that haven't been persisted live only in the tab's memory
- Google Drive access tokens are kept in memory, scoped to the limited `drive.file` permission

Review the data and pricing policies of the models on OpenRouter before sending any sensitive information.

## 🏗️ Architecture at a Glance

```text
Browser (React SPA)
├─ Landing / Model Catalog
└─ Studio
   ├─ UI: Header · Prompt Composer · Sidebar · Gallery · Modals
   ├─ Store: mutable singleton + useSyncExternalStore
   ├─ Actions: generation · queue · polling · persistence · export
   ├─ Local data: sessionStorage · localStorage · IndexedDB
   └─ External services
      ├─ OpenRouter API — models, image, video, audio, TTS, and assistant
      └─ Google Drive API — optional file upload
```

The app routes requests based on the model's modality: image+text models use chat completions, image-only models use the Image API, video uses an async job with polling, and audio/TTS use whichever path matches the model. Every request flows through a central request governor that manages concurrency.

## 📁 Project Structure

```text
atelier/
├─ public/assets/atelier-logo.png      # Main logo and favicon
├─ src/
│  ├─ components/                 # Studio UI, modals, gallery, and catalog
│  ├─ lib/
│  │  ├─ actions.ts               # Orchestration and business logic
│  │  ├─ constants.ts             # Modes, models, limits, and templates
│  │  ├─ store.ts                 # Global state and browser storage
│  │  ├─ galleryStore.ts          # IndexedDB gallery persistence
│  │  ├─ fsAccess.ts              # Auto Save to local disk
│  │  ├─ googleDrive.ts           # Google OAuth and Drive upload
│  │  ├─ shortcuts.ts             # Global keyboard shortcuts
│  │  └─ types.ts                 # TypeScript domain types
│  ├─ pages/                      # Landing, Studio, and Model Catalog
│  ├─ index.css
│  └─ main.tsx
├─ legacy/index.html              # The original single-file version
├─ vite.config.ts
├─ vercel.json                    # SPA rewrite for Vercel
└─ package.json
```

## 🌐 Production & Deployment

```bash
npm run build
npm run preview
```

The output lands in `dist/` and can be deployed to any static hosting provider. A SPA rewrite is already set up for Vercel; on other providers, you'll need to configure `/studio` and `/models` to fall back to `index.html`.

If Google Drive is enabled, add `VITE_GOOGLE_CLIENT_ID` to your hosting environment and set the Authorized JavaScript origins in Google Cloud to match your production domain.

## 🤝 Contributing

1. Create a branch for the change you want to make
2. Keep TypeScript strict, and add domain types to `src/lib/types.ts`
3. Keep limits and model metadata centralized in `src/lib/constants.ts`
4. Never commit secrets or API keys to source code
5. Run `npm run build` before opening a Pull Request

## ⚠️ Known Limitations

- Model availability, pricing, and capabilities may change on OpenRouter's end
- Video progress is a time-based estimate, since the API doesn't report real percentages
- Closing the tab while a job has already been accepted by the provider may leave the result incomplete
- Gallery Persistence is opt-in and evicts non-favorited older items once storage limits are hit
- The app does not guarantee actual costs — always verify charges in your OpenRouter account

## 📄 License

This project has not yet specified a license, so all rights are reserved by default. If you'd like to publish, modify, or redistribute it, please get permission from the repository owner first.

---

<div align="center">

Systematic media creation, from first idea to ready-to-use file — **Atelier**

</div>
