# Job Application Tracker Chrome Extension

A Chrome Extension (Manifest V3) that automatically detects and tracks job applications across multiple job boards without manual input.

## Project Overview

Automatically captures job applications from LinkedIn, Greenhouse, Workday, Lever, Ashby, and generic career sites. Data is stored locally via `chrome.storage.local` — no backend or cloud sync.

## Architecture

```
job_tracker/
├── manifest.json           # MV3 extension config — permissions, content script rules
├── background/
│   └── worker.js           # Service worker — central message hub (CRUD for applications)
├── content/
│   ├── utils.js            # Shared: reportApplication(), waitForElement(), watchForText()
│   ├── linkedin.js         # LinkedIn detection (URL change, success text, fetch intercept relay)
│   ├── linkedin_page.js    # Runs in MAIN world — intercepts fetch/XHR on LinkedIn
│   ├── greenhouse.js       # Greenhouse ATS detection
│   ├── workday.js          # Workday detection (uses automation IDs)
│   ├── lever.js            # Lever jobs detection
│   ├── ashby.js            # Ashby jobs detection
│   └── generic.js          # Fallback for unknown career sites
├── popup/
│   ├── popup.html          # 320px popup — shows stats + 5 most recent applications
│   └── popup.js
└── dashboard/
    ├── dashboard.html      # Full app management UI (filters sidebar + table)
    ├── dashboard.js        # Filtering, searching, CRUD, CSV export
    └── dashboard.css
```

## Key Design Decisions

- **No build system**: Pure vanilla JS — load unpacked directly in Chrome, no npm/bundler needed.
- **MAIN world script**: `linkedin_page.js` runs in MAIN world to intercept `fetch`/`XHR` that isolated content scripts can't access.
- **Deduplication**: 5-minute window prevents duplicate tracking for the same application.
- **Platform-specific scripts**: Each job board gets its own content script with custom selectors; `generic.js` is the fallback.

## Development

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Edit files, then click the refresh icon on the extension card

No build step required. Changes to content scripts take effect on the next page load; changes to `worker.js` or `popup.js` require refreshing the extension.

## Message Protocol

Content scripts communicate with the background worker via `chrome.runtime.sendMessage`:

| Message Type | Payload | Description |
|---|---|---|
| `JOB_APPLIED` | `{company, role, url, date}` | Report a detected application |
| `GET_APPLICATIONS` | — | Fetch all stored applications |
| `UPDATE_APPLICATION` | `{id, status, ...}` | Update application status/fields |
| `DELETE_APPLICATION` | `{id}` | Remove an application |
| `ADD_APPLICATION` | `{company, role, ...}` | Manually add an application |

## Application Status Flow

`Applied` → `Phone Screen` → `Interview` → `Offer` / `Rejected`
