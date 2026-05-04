# Job Application Tracker Chrome Extension

A Chrome Extension (Manifest V3) for manually tracking job applications with AI-powered job description analysis, resume management, and cover letter generation.

## Project Overview

Applications are added manually via a floating banner on job pages, or directly in the dashboard. Data is stored locally via `chrome.storage.local`. AI features use two backends:
- **Groq API** (user-supplied key, stored locally) — JD analysis and cover letter generation
- **Cloudflare Worker** (`cloudflare/worker.js`) — Resume analysis via Gemini 2.5 Flash; deployed separately

## Architecture

```
job_tracker/
├── manifest.json           # MV3 config — permissions, content script rules
├── background/
│   └── worker.js           # Service worker — message hub (CRUD, Groq, CF Worker calls)
├── cloudflare/
│   └── worker.js           # Cloudflare Worker — resume analysis proxy (Gemini 2.5 Flash)
├── content/
│   ├── banner.js           # Floating panel on job pages — add apps, generate/pick CL, analyze JD
│   ├── banner.css
│   ├── analyzer.js         # Injects "Analyze Job" button + slide-in sidebar on job board URLs
│   └── analyzer.css
├── popup/
│   ├── popup.html          # 340px popup — stats + 5 recent apps with inline status change
│   └── popup.js
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.js        # Filtering, CRUD, CSV export, CL modal, Resumes tab, CL Library tab
│   └── dashboard.css
├── options/
│   ├── options.html        # Settings — Groq API key + model only
│   ├── options.js
│   └── options.css
└── lib/
    └── mammoth.min.js      # DOCX text extraction (used in dashboard for resume upload)
```

## Key Design Decisions

- **No build system**: Pure vanilla JS — load unpacked directly in Chrome.
- **No auto-detection**: All platform-specific content scripts removed. Applications are added manually via the banner or dashboard.
- **Banner-first UX**: `content/banner.js` is the primary capture tool. It injects on job pages (URL-based detection only, no body scanning), auto-fills role/company from DOM, and lets users add to dashboard, generate a cover letter, pick one from the library, or analyze the JD.
- **Groq for AI**: JD analysis and cover letter generation via `callGroq()` in `worker.js`. Default model: `llama-3.3-70b-versatile`. Key and model stored in `chrome.storage.local`.
- **Cloudflare Worker for resume analysis**: Accepts PDF (base64) or text, calls Gemini 2.5 Flash, returns structured JSON. Auth via `X-Token` header matching `EXTENSION_TOKEN` secret. Hardcoded in `background/worker.js` as `CF_WORKER_URL` / `CF_TOKEN`.
- **Resume storage**: `resumeVersions: [{id, analysis, filename, createdAt, isFavorite, _raw: {pdf?, text?}}]`. Upload stores raw file data; analysis is triggered separately via "Analyze Resume" button. PDF files render inline in the dashboard via blob URL iframe.
- **Cover letter library**: Global `clLibrary: [{id, title, text, createdAt, isFavorite}]` separate from per-application CLs. Editable in Dashboard → Cover Letters tab. Can be picked directly in the banner via "From Library".
- **Per-app cover letters**: Each application stores `coverLetters: [{id, text, createdAt, isFavorite}]`. Dashboard CL modal lists versions, supports generate/copy/favorite/delete/save-to-library/download-as-PDF.
- **PDF download**: Cover letters can be downloaded as real PDF files (minimal PDF built from scratch in `buildMinimalPdf()` — no external library).
- **Force banner**: `Alt+Shift+J` shortcut or popup "+" button sends `FORCE_BANNER` message to active tab, injecting the banner even on non-job pages.

## Development

### Chrome Extension
1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Edit files → click the refresh icon on the extension card

Content scripts take effect on next page load. Changes to `background/worker.js` require refreshing the extension.

### Cloudflare Worker (resume analysis)
Deployed at `job-tracker-analyzer.marat-gal.workers.dev`. See `cloudflare/worker.js` header for deploy instructions. Requires secrets: `GEMINI_API_KEY` and `EXTENSION_TOKEN`.

## Message Protocol

| Message Type | Payload | Description |
|---|---|---|
| `GET_APPLICATIONS` | — | Fetch all stored applications |
| `ADD_APPLICATION` | `{company, role, url, platform, status}` | Manually add an application |
| `UPDATE_APPLICATION` | `{id, updates}` | Update fields |
| `DELETE_APPLICATION` | `{id}` | Remove an application |
| `ANALYZE_JD` | `{text}` | Send JD text to Groq; returns `{result}` or `{error}` |
| `ANALYZE_RESUME` | `{pdf?, text?}` | Send to CF Worker→Gemini; returns `{result}` or `{error}` |
| `GENERATE_COVER_LETTER` | `{company, role, appId?}` | Generate via Groq using favorite resume; returns `{letter}` or `{error}` |
| `SAVE_COVER_LETTER` | `{appId, text}` | Save version to application |
| `GET_COVER_LETTERS` | `{appId}` | Returns `{coverLetters}` |
| `SET_FAVORITE_CL` | `{appId, versionId}` | Mark favorite per-app version |
| `DELETE_COVER_LETTER` | `{appId, versionId}` | Delete version |
| `GET_RESUME_VERSIONS` | — | Returns `{versions}` |
| `SET_FAVORITE_RESUME` | `{versionId}` | Set favorite resume (used for CL generation) |
| `DELETE_RESUME_VERSION` | `{versionId}` | Delete; auto-promotes next if favorite |
| `GET_CL_LIBRARY` | — | Returns `{entries}` |
| `SAVE_CL_TO_LIBRARY` | `{title, text}` | Add to global library |
| `UPDATE_CL_IN_LIBRARY` | `{id, updates}` | Edit title/text |
| `DELETE_CL_FROM_LIBRARY` | `{id}` | Remove from library |
| `SET_FAVORITE_CL_LIBRARY` | `{id}` | Mark library favorite |
| `OPEN_OPTIONS` | — | Open settings page |
| `OPEN_DASHBOARD` | — | Open dashboard in new tab |
| `FORCE_BANNER` | — | Inject banner on any page (sent to active tab) |

## Application Status Flow

`Need to Apply` → `Applied` → `Phone Screen` → `Interview` → `Offer` / `Rejected` / `Withdrawn`

Status is changeable inline in the banner, popup, and dashboard table.
