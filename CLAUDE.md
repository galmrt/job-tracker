# Job Application Tracker Chrome Extension

A Chrome Extension (Manifest V3) that automatically detects and tracks job applications across multiple job boards without manual input. Includes AI-powered job description analysis, resume analysis, and cover letter generation.

## Project Overview

Automatically captures job applications from LinkedIn, Greenhouse, Workday, Lever, Ashby, and generic career sites. Application data is stored locally via `chrome.storage.local`. AI features use two backends:
- **Groq API** (user-supplied key, stored locally) — JD analysis and cover letter generation
- **Cloudflare Worker** (`cloudflare/worker.js`) — Resume analysis via Gemini 2.5 Flash; deployed separately, proxies requests to Google AI Studio

## Architecture

```
job_tracker/
├── manifest.json           # MV3 extension config — permissions, content script rules
├── background/
│   └── worker.js           # Service worker — central message hub (CRUD, Groq, CF Worker calls)
├── cloudflare/
│   └── worker.js           # Cloudflare Worker — resume analysis proxy (Gemini 2.5 Flash)
├── content/
│   ├── utils.js            # Shared: reportApplication(), waitForElement(), watchForText()
│   ├── linkedin.js         # LinkedIn detection (URL change, success text, fetch intercept relay)
│   ├── linkedin_page.js    # Runs in MAIN world — intercepts fetch/XHR on LinkedIn
│   ├── greenhouse.js       # Greenhouse ATS detection
│   ├── workday.js          # Workday detection (uses automation IDs)
│   ├── lever.js            # Lever jobs detection
│   ├── ashby.js            # Ashby jobs detection
│   ├── generic.js          # Fallback for unknown career sites (auto-detect on submission)
│   ├── banner.js           # Floating panel (bottom-left) on ALL job pages — manual add + cover letter
│   ├── banner.css          # Styles for the banner panel
│   ├── analyzer.js         # Injects "Analyze Job" button + slide-in sidebar on job pages
│   └── analyzer.css        # Styles for the analyzer button and sidebar
├── popup/
│   ├── popup.html          # 320px popup — shows stats + 5 most recent applications
│   └── popup.js
├── dashboard/
│   ├── dashboard.html      # Full app management UI (filters sidebar + table)
│   ├── dashboard.js        # Filtering, searching, CRUD, CSV export, cover letter modal
│   └── dashboard.css
├── options/
│   ├── options.html        # Settings page
│   ├── options.js          # Groq API key, model selection, resume upload + AI analysis
│   └── options.css
└── lib/
    ├── pdf.min.js          # PDF.js — client-side PDF text extraction
    ├── pdf.worker.min.js   # PDF.js web worker (web-accessible resource)
    └── mammoth.min.js      # Mammoth.js — client-side DOCX text extraction
```

## Key Design Decisions

- **No build system**: Pure vanilla JS — load unpacked directly in Chrome, no npm/bundler needed.
- **MAIN world script**: `linkedin_page.js` runs in MAIN world to intercept `fetch`/`XHR` that isolated content scripts can't access.
- **Deduplication**: 5-minute window prevents duplicate tracking for the same application.
- **Platform-specific scripts**: Each job board gets its own content script with custom selectors; `generic.js` is the fallback.
- **Groq for AI**: JD analysis and cover letter generation go through `callGroq()` in `worker.js`. Default model: `llama-3.3-70b-versatile`. The API key and selected model are stored in `chrome.storage.local`.
- **Cloudflare Worker for resume analysis**: `cloudflare/worker.js` is a separate deployed proxy that accepts PDF (base64) or text, calls Gemini 2.5 Flash, and returns structured JSON. Auth via `X-Token` header matching `EXTENSION_TOKEN` secret. URL and token are hardcoded in `background/worker.js` as `CF_WORKER_URL` / `CF_TOKEN`.
- **Structured resume storage**: Resumes stored as `resumeVersions: [{id, analysis, filename, createdAt, isFavorite}]`. Old `resumeAnalysis`/`resumeFileName` keys are auto-migrated on first access. The worker calls `formatResumeForLLM()` to serialize the favorite resume for Groq.
- **Cover letter versioning**: Each application stores `coverLetters: [{id, text, createdAt, isFavorite}]`. The dashboard CL modal lists all versions; users can star a favorite and delete old ones.
- **Job capture banner**: `content/banner.js` injects a collapsible panel (bottom-left) on all career pages. Auto-detects role/company from DOM, lets user confirm and add to dashboard. Also generates cover letters inline before applying. SPA-aware (re-injects on URL change).
- **Local file parsing (pre-AI)**: PDF raw bytes and DOCX/TXT text are extracted in-browser via pdf.js/mammoth.js in `options.js`, then sent to the CF Worker for AI analysis.

## Development

### Chrome Extension
1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Edit files, then click the refresh icon on the extension card

No build step required. Changes to content scripts take effect on the next page load; changes to `background/worker.js` or `popup.js` require refreshing the extension.

### Cloudflare Worker (resume analysis)
Deployed separately at `job-tracker-analyzer.marat-gal.workers.dev`. See header comment in `cloudflare/worker.js` for deploy instructions. Requires two secrets: `GEMINI_API_KEY` and `EXTENSION_TOKEN` (must match `CF_TOKEN` in `background/worker.js`).

## Message Protocol

Content scripts and UI pages communicate with the background worker via `chrome.runtime.sendMessage`:

| Message Type | Payload | Description |
|---|---|---|
| `JOB_APPLIED` | `{company, role, url, date}` | Report a detected application |
| `GET_APPLICATIONS` | — | Fetch all stored applications |
| `UPDATE_APPLICATION` | `{id, status, ...}` | Update application status/fields |
| `DELETE_APPLICATION` | `{id}` | Remove an application |
| `ADD_APPLICATION` | `{company, role, ...}` | Manually add an application |
| `ANALYZE_JD` | `{text}` | Send JD text to Groq; returns `{result}` or `{error}` |
| `ANALYZE_RESUME` | `{pdf?, text?}` | Send resume (PDF as base64 or extracted text) to CF Worker→Gemini; returns `{result}` or `{error}` |
| `GENERATE_COVER_LETTER` | `{company, role, appId?}` | Generate cover letter via Groq (worker looks up favorite resume internally); auto-saves to `app.coverLetters[]` if `appId` given; returns `{letter}` or `{error: 'NO_RESUME'\|'NO_API_KEY'}` |
| `SAVE_COVER_LETTER` | `{appId, text}` | Manually save a cover letter version to an application |
| `GET_COVER_LETTERS` | `{appId}` | Returns `{coverLetters: [{id, text, createdAt, isFavorite}]}` |
| `SET_FAVORITE_CL` | `{appId, versionId}` | Mark one cover letter version as favorite for an application |
| `DELETE_COVER_LETTER` | `{appId, versionId}` | Delete a cover letter version |
| `GET_RESUME_VERSIONS` | — | Returns `{versions: [{id, analysis, filename, createdAt, isFavorite}]}` |
| `SET_FAVORITE_RESUME` | `{versionId}` | Set a resume version as favorite (used in cover letter generation) |
| `DELETE_RESUME_VERSION` | `{versionId}` | Delete a resume version (auto-promotes next if favorite was deleted) |
| `OPEN_OPTIONS` | — | Open the extension options page |

## AI Features

### JD Analyzer (`content/analyzer.js`)
Injected on all major job board URLs. Adds a floating "Analyze Job" button that opens a slide-in sidebar with:
- Role summary (2 sentences)
- Seniority level
- Required skills (up to 8)
- Nice-to-have skills (up to 5)
- Likely interview topics (up to 5)

JD text is extracted via a prioritized list of platform-specific selectors and capped at 8,000 characters before being sent to Groq.

### Cover Letter Generator (`dashboard/dashboard.js`)
Each application row in the dashboard has a "✦" button that opens a cover letter modal. On generate, reads `resumeAnalysis` from `chrome.storage.local`, serializes it via `formatResumeForLLM()`, and sends company, role, and formatted resume text to Groq. Returns a 3-paragraph letter body.

### Resume Analyzer (`options/options.js` + `cloudflare/worker.js`)
Resume upload (drag-and-drop or file picker) on the options page supports PDF, DOCX, and TXT:
- PDF: converted to base64 in-browser, sent as `pdf` to the CF Worker (Gemini can read the raw PDF natively)
- DOCX: text extracted via mammoth.js, sent as `text`
- TXT: read directly, sent as `text`

The CF Worker calls Gemini 2.5 Flash and returns structured JSON: `{name, summary, skills, experience, education, strengths}`. This is stored as `resumeAnalysis` in `chrome.storage.local`.

### Options Page (`options/`)
- Groq API key input (show/hide toggle)
- Model selector
- Resume upload with rich structured analysis display (name card, skills badges, experience timeline, strengths)
- "Re-upload" button to replace the stored analysis

## Application Status Flow

`Applied` → `Phone Screen` → `Interview` → `Offer` / `Rejected` / `Withdrawn`
