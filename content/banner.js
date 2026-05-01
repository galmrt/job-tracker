// Job Tracker — page banner
// Floating panel (top-right) on job pages. Add jobs, generate cover letters,
// and analyze job descriptions — all before applying.

(function () {
  'use strict';
  if (window.self !== window.top) return;

  // ── Detection ───────────────────────────────────────────────────────────────

  // Known job platforms — always show banner
  const JOB_PLATFORM_RX = /linkedin\.com\/jobs|greenhouse\.io|myworkdayjobs\.com|jobs\.lever\.co|jobs\.ashbyhq\.com|indeed\.com|glassdoor\.com|ziprecruiter\.com|dice\.com|monster\.com|wellfound\.com|ycombinator\.com\/jobs/;

  // URL path patterns that strongly suggest a job listing page
  const CAREER_URL_RX = /\/jobs\/|\/job\/|\/careers\/|\/career\/|\/job-posting|\/positions\/|\/openings\/|\bjobs\.[a-z]/;

  // Platform names to ignore when extracting company from meta tags
  const PLATFORM_NAMES = /^(linkedin|indeed|glassdoor|greenhouse|lever|ashby|workday|ziprecruiter|monster|dice|jobs)$/i;

  function isJobPage() {
    const url  = window.location.href.toLowerCase();
    const host = window.location.hostname.toLowerCase();
    if (JOB_PLATFORM_RX.test(url + host)) return true;
    if (CAREER_URL_RX.test(url))           return true;
    return false;
  }

  // ── Extraction ──────────────────────────────────────────────────────────────

  const JD_SELECTORS = [
    '[data-automation-id="jobPostingDescription"]',
    '#content', '.job-post', '.posting-description',
    '[class*="job-description"]', '[class*="jobDescription"]',
    '.jobs-description-content__text', '.jobs-description__content',
    '[id*="job-description"]', '[id*="jobDescription"]',
    '[class*="job-details"]', '[class*="jobDetails"]',
    'article', 'main'
  ];

  function extractJD() {
    for (const sel of JD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.innerText.trim();
        if (t.length > 200) return t.slice(0, 8000);
      }
    }
    return document.body.innerText.slice(0, 8000);
  }

  // Reject text that looks like widget content (Jobright match scores, etc.)
  function looksLikeRole(text) {
    if (!text || text.length < 3 || text.length > 150) return false;
    if (/\b(match|keyword|perfect|score|fair|good|resume|profile|qualif)/i.test(text)) return false;
    return true;
  }

  function extractRole() {
    // Page title is usually most reliable (set by the job platform)
    const titleRole = parseRoleFromTitle(document.title);
    if (titleRole) return titleRole;

    // og:title next
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const ogRole  = parseRoleFromTitle(ogTitle);
    if (ogRole) return ogRole;

    // Platform-specific + generic DOM selectors (may pick up widget content)
    const selectors = [
      '[data-automation-id="jobPostingHeader"]',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      '[class*="job-title"] h1', '[class*="jobTitle"] h1',
      '[class*="top-card"] h1',
      '[class*="job-title"]', '[class*="jobTitle"]',
      '[class*="posting-headline"]', '[class*="position-title"]',
      'h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t  = el?.textContent?.trim().split('\n')[0].trim();
      if (looksLikeRole(t)) return t;
    }

    return '';
  }

  function parseRoleFromTitle(title) {
    if (!title) return '';
    // Strip trailing platform name: "Role | Company | LinkedIn" → "Role | Company"
    const cleaned = title.replace(/\s*[|\-–]\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Ashby|Workday)\s*$/i, '').trim();
    // "Role at Company" → take the part before "at"
    const atMatch = cleaned.match(/^(.+?)\s+at\s+.+$/i);
    if (atMatch) return atMatch[1].trim();
    // "Role | Company" or "Role - Company" → take the first segment
    const sepMatch = cleaned.match(/^([^|\-–]{4,80}?)\s*[|\-–]/);
    if (sepMatch) return sepMatch[1].trim();
    return '';
  }

  function extractCompany() {
    // Structured data (most reliable)
    try {
      const ld = document.querySelector('script[type="application/ld+json"]');
      if (ld) {
        const d = JSON.parse(ld.textContent);
        if (d.hiringOrganization?.name) return d.hiringOrganization.name;
      }
    } catch {}

    // LinkedIn-specific selectors
    const liCompany = document.querySelector(
      '.job-details-jobs-unified-top-card__company-name a, ' +
      '.jobs-unified-top-card__company-name a, ' +
      '[class*="company-name"] a'
    );
    if (liCompany) return liCompany.textContent.trim();

    // og:site_name — skip generic platform names
    const og = document.querySelector('meta[property="og:site_name"]')?.content;
    if (og && !PLATFORM_NAMES.test(og.trim())) return og;

    // Parse from page title: "Role at Company" or "Role | Company"
    const companyFromTitle = parseCompanyFromTitle(document.title);
    if (companyFromTitle) return companyFromTitle;

    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const companyFromOg = parseCompanyFromTitle(ogTitle);
    if (companyFromOg) return companyFromOg;

    // Domain fallback
    return window.location.hostname.replace('www.', '').split('.')[0]
      .replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function parseCompanyFromTitle(title) {
    if (!title) return '';
    // Strip trailing known platform: "Role | Company | LinkedIn" → "Role | Company"
    const stripped = title.replace(/\s*[|\-–]\s*(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Ashby|Workday)\s*$/i, '').trim();
    // "Role at Company" → take part after "at"
    const atMatch = stripped.match(/\bat\s+([A-Z][^|\-–]{1,60}?)(?:\s*[|\-–]|$)/);
    if (atMatch) return atMatch[1].trim();
    // "Role | Company" → last segment
    const parts = stripped.split(/\s*[|\-–]\s*/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].trim();
      if (last.length > 1 && last.length < 60) return last;
    }
    return '';
  }

  function detectPlatform() {
    const h = window.location.hostname;
    if (h.includes('linkedin.com'))      return 'linkedin';
    if (h.includes('greenhouse.io'))     return 'greenhouse';
    if (h.includes('myworkdayjobs.com')) return 'workday';
    if (h.includes('lever.co'))          return 'lever';
    if (h.includes('ashbyhq.com'))       return 'ashby';
    return 'generic';
  }

  // ── State ───────────────────────────────────────────────────────────────────

  let expanded      = false;
  let wide          = false;
  let savedAppId    = null;
  let analyzeCache  = null; // {url, result}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function showStatus(msg, type) {
    const el = $('jt-status');
    el.textContent   = msg;
    el.className     = `jt-banner-status jt-status-${type}`;
    el.style.display = 'block';
    if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  function toggleBanner() {
    expanded = !expanded;
    $('jt-body').style.display  = expanded ? 'flex' : 'none';
    $('jt-chevron').textContent = expanded ? '▼' : '▲';
  }

  const NARROW = 170;
  const WIDE   = 320;

  function setWide(on) {
    wide = on;
    const banner       = $('jt-banner');
    const isLeftAnchor = banner.style.right === 'auto' && banner.style.left;

    if (isLeftAnchor) {
      // Expand leftward by shifting the left position
      const currentLeft = parseFloat(banner.style.left) || 0;
      const delta       = WIDE - NARROW;
      banner.style.left = on
        ? Math.max(0, currentLeft - delta) + 'px'
        : (currentLeft + delta) + 'px';
    }

    banner.style.width             = on ? WIDE + 'px' : NARROW + 'px';
    $('jt-expand').textContent     = on ? '⤡' : '⤢';
    $('jt-expand').title           = on ? 'Collapse' : 'Expand';
  }

  function toggleWide() { setWide(!wide); }

  // ── Field population with retry ──────────────────────────────────────────────
  // SPAs load content asynchronously — retry until we get values or give up.

  function tryFillFields(attempt = 0) {
    if (!$('jt-banner')) return; // banner removed (URL change)

    const role    = extractRole();
    const company = extractCompany();

    if (role    && !$('jt-role').value)    $('jt-role').value    = role;
    if (company && !$('jt-company').value) $('jt-company').value = company;

    if ((!$('jt-role').value || !$('jt-company').value) && attempt < 8) {
      setTimeout(() => tryFillFields(attempt + 1), 600);
    }
  }

  // ── Add to dashboard ────────────────────────────────────────────────────────

  function onAddClick() {
    const role    = $('jt-role').value.trim();
    const company = $('jt-company').value.trim();
    const btn     = $('jt-add-btn');
    btn.disabled    = true;
    btn.textContent = 'Adding…';

    try {
      chrome.runtime.sendMessage({
        type: 'ADD_APPLICATION',
        data: {
          company:  company || 'Unknown Company',
          role:     role    || 'Unknown Role',
          url:      location.href,
          platform: detectPlatform(),
          status:   $('jt-status-select').value
        }
      }, resp => {
        if (chrome.runtime.lastError || !resp?.application) {
          btn.disabled    = false;
          btn.textContent = '+ Add to Dashboard';
          showStatus('Could not save. Try reloading.', 'error');
          return;
        }
        savedAppId      = resp.application.id;
        btn.textContent = 'Added ✓';
        btn.className   = 'jt-btn jt-btn-added';
        showStatus('Saved to dashboard', 'success');
      });
    } catch {
      btn.disabled    = false;
      btn.textContent = '+ Add to Dashboard';
      showStatus('Extension error. Reload the page.', 'error');
    }
  }

  // ── Cover letter ────────────────────────────────────────────────────────────

  let clLibEntries = [];

  function onCLClick() {
    const role     = $('jt-role').value.trim()    || 'Unknown Role';
    const company  = $('jt-company').value.trim() || 'Unknown Company';
    const clSec    = $('jt-cl-section');
    const loading  = $('jt-cl-loading');
    const outWrap  = $('jt-cl-out-wrap');
    const clBtn    = $('jt-cl-btn');
    const regenBtn = $('jt-cl-regen');

    clSec.style.display              = 'flex';
    loading.style.display            = 'flex';
    outWrap.style.display            = 'none';
    $('jt-cl-lib-wrap').style.display = 'none';
    clBtn.disabled                   = true;
    regenBtn.disabled                = true;
    setWide(true);

    try {
      chrome.runtime.sendMessage(
        { type: 'GENERATE_COVER_LETTER', company, role, appId: savedAppId || null },
        resp => {
          loading.style.display = 'none';
          clBtn.disabled        = false;
          regenBtn.disabled     = false;

          if (!resp || resp.error) {
            const e = resp?.error || 'unknown error';
            if (e === 'NO_API_KEY') showStatus('No Groq API key — open extension settings.', 'error');
            else if (e === 'NO_RESUME') showStatus('No resume on file — upload one in Settings.', 'error');
            else showStatus(`Error: ${e}`, 'error');
            clSec.style.display = 'none';
            return;
          }

          $('jt-cl-out').value  = resp.letter || '';
          outWrap.style.display = 'flex';
        }
      );
    } catch {
      loading.style.display = 'none';
      clBtn.disabled        = false;
      regenBtn.disabled     = false;
      showStatus('Extension error. Reload the page.', 'error');
    }
  }

  function onCLLibClick() {
    chrome.runtime.sendMessage({ type: 'GET_CL_LIBRARY' }, result => {
      clLibEntries = result?.entries || [];
      if (!clLibEntries.length) {
        showStatus('No cover letters in library yet.', 'error');
        return;
      }

      const sel = $('jt-cl-lib-select');
      sel.innerHTML = '<option value="">Choose from library…</option>' +
        clLibEntries.map(e =>
          `<option value="${e.id}">${esc(e.title)}${e.isFavorite ? ' ★' : ''}</option>`
        ).join('');

      $('jt-cl-section').style.display   = 'flex';
      $('jt-cl-lib-wrap').style.display  = 'block';
      $('jt-cl-loading').style.display   = 'none';
      $('jt-cl-out-wrap').style.display  = 'none';
      setWide(true);
    });
  }

  // ── Analyze JD ─────────────────────────────────────────────────────────────

  function onAnalyzeClick() {
    const analyzeBtn = $('jt-analyze-btn');
    const section    = $('jt-analyze-section');
    const loading    = $('jt-analyze-loading');
    const results    = $('jt-analyze-results');

    // Return cached result for same URL
    if (analyzeCache && analyzeCache.url === location.href) {
      section.style.display  = 'flex';
      loading.style.display  = 'none';
      results.style.display  = 'block';
      renderAnalyzeResults(analyzeCache.result);
      return;
    }

    section.style.display  = 'flex';
    loading.style.display  = 'flex';
    results.style.display  = 'none';
    results.innerHTML      = '';
    analyzeBtn.disabled    = true;
    setWide(true);

    try {
      chrome.runtime.sendMessage(
        { type: 'ANALYZE_JD', text: extractJD() },
        resp => {
          analyzeBtn.disabled   = false;
          loading.style.display = 'none';

          if (!resp || resp.error) {
            const e = resp?.error || 'unknown error';
            if (e === 'NO_API_KEY') showStatus('No Groq API key — open extension settings.', 'error');
            else showStatus(`Analysis error: ${e}`, 'error');
            section.style.display = 'none';
            return;
          }

          analyzeCache = { url: location.href, result: resp.result };
          results.style.display = 'block';
          renderAnalyzeResults(resp.result);
        }
      );
    } catch {
      analyzeBtn.disabled   = false;
      loading.style.display = 'none';
      showStatus('Extension error. Reload the page.', 'error');
      section.style.display = 'none';
    }
  }

  function renderAnalyzeResults(data) {
    const results = $('jt-analyze-results');

    const badge = (cls, s) => `<span class="jt-badge jt-badge-${cls}">${esc(s)}</span>`;
    const section = (label, items, cls) => items?.length
      ? `<div class="jt-ar-label">${label}</div><div class="jt-badge-row">${items.map(s => badge(cls, s)).join('')}</div>`
      : '';

    results.innerHTML = `
      ${data.summary   ? `<div class="jt-ar-summary">${esc(data.summary)}</div>` : ''}
      ${data.seniority ? `<div class="jt-ar-seniority">${esc(data.seniority)}</div>` : ''}
      ${section('Required Skills',         data.required_skills, 'req')}
      ${section('Nice to Have',            data.nice_to_have,    'nice')}
      ${section('Likely Interview Topics', data.interview_topics,'topic')}
    `;
  }

  // ── Build banner HTML ────────────────────────────────────────────────────────

  function buildBanner() {
    const el = document.createElement('div');
    el.id = 'jt-banner';
    el.innerHTML = `
      <div class="jt-banner-tab" id="jt-tab">
        <span class="jt-banner-tab-icon">JT</span>
        <span class="jt-banner-tab-text">Job Tracker</span>
        <span class="jt-banner-expand" id="jt-expand" title="Expand">⤢</span>
        <span class="jt-banner-chevron" id="jt-chevron">▼</span>
      </div>
      <div class="jt-banner-body" id="jt-body">
        <div class="jt-banner-fields">
          <div class="jt-banner-field">
            <span class="jt-label">Role</span>
            <input class="jt-input" id="jt-role" type="text" placeholder="Job title" />
          </div>
          <div class="jt-banner-field">
            <span class="jt-label">Company</span>
            <input class="jt-input" id="jt-company" type="text" placeholder="Company name" />
          </div>
        </div>

        <div class="jt-banner-field">
          <span class="jt-label">Status</span>
          <select class="jt-input jt-status-select" id="jt-status-select">
            <option value="need_to_apply">Need to Apply</option>
            <option value="applied" selected>Applied</option>
            <option value="phone_screen">Phone Screen</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        <div class="jt-banner-actions">
          <button class="jt-btn jt-btn-primary" id="jt-add-btn">+ Add to Dashboard</button>
          <div class="jt-btn-row">
            <button class="jt-btn jt-btn-secondary" id="jt-cl-btn">Cover Letter</button>
            <button class="jt-btn jt-btn-secondary" id="jt-analyze-btn">Analyze</button>
          </div>
        </div>

        <div class="jt-banner-status" id="jt-status"></div>

        <button class="jt-btn jt-btn-ghost jt-btn-dashboard" id="jt-dashboard-btn">Dashboard</button>

        <!-- Analyze results -->
        <div class="jt-analyze-section" id="jt-analyze-section">
          <div class="jt-section-header">
            <span class="jt-section-title">Job Analysis</span>
            <button class="jt-section-close" id="jt-analyze-close">×</button>
          </div>
          <div class="jt-cl-loading" id="jt-analyze-loading">
            <div class="jt-spinner"></div>
            <span>Analyzing…</span>
          </div>
          <div id="jt-analyze-results"></div>
        </div>

        <!-- Cover letter -->
        <div class="jt-cl-section" id="jt-cl-section">
          <div class="jt-section-header">
            <span class="jt-section-title">Cover Letter</span>
            <button class="jt-section-close" id="jt-cl-close">×</button>
          </div>
          <div class="jt-cl-loading" id="jt-cl-loading">
            <div class="jt-spinner"></div>
            <span>Writing cover letter…</span>
          </div>
          <div class="jt-cl-output-wrap" id="jt-cl-out-wrap">
            <textarea class="jt-cl-textarea" id="jt-cl-out" readonly></textarea>
            <div class="jt-cl-footer">
              <button class="jt-btn jt-btn-ghost" id="jt-cl-regen">Regenerate</button>
              <button class="jt-btn jt-btn-ghost" id="jt-cl-copy">Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  // ── Drag to move ────────────────────────────────────────────────────────────

  function makeDraggable(panel, handle) {
    let startX, startY, startLeft, startTop, dragged = false;

    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      // Switch from right-anchored to left-anchored positioning
      const rect = panel.getBoundingClientRect();
      panel.style.right  = 'auto';
      panel.style.left   = rect.left + 'px';
      panel.style.top    = rect.top  + 'px';

      startX    = e.clientX;
      startY    = e.clientY;
      startLeft = rect.left;
      startTop  = rect.top;
      dragged   = false;

      handle.classList.add('dragging');

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;

        const newLeft = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  startLeft + dx));
        const newTop  = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, startTop  + dy));
        panel.style.left = newLeft + 'px';
        panel.style.top  = newTop  + 'px';
      }

      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        // Suppress the click event if we actually dragged
        if (dragged) {
          handle.addEventListener('click', e => e.stopImmediatePropagation(), { once: true, capture: true });
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function injectBanner() {
    if (!isJobPage())   return;
    if ($('jt-banner')) return;

    buildBanner();

    // Drag to move
    makeDraggable($('jt-banner'), $('jt-tab'));

    // Events
    $('jt-expand').addEventListener('click', e => { e.stopPropagation(); toggleWide(); });
    $('jt-tab').addEventListener('click', toggleBanner);
    $('jt-add-btn').addEventListener('click', onAddClick);
    $('jt-cl-btn').addEventListener('click', onCLClick);
    $('jt-analyze-btn').addEventListener('click', onAnalyzeClick);
    $('jt-cl-regen').addEventListener('click', onCLClick);
    $('jt-analyze-close').addEventListener('click', () => {
      $('jt-analyze-section').style.display = 'none';
    });
    $('jt-cl-close').addEventListener('click', () => {
      $('jt-cl-section').style.display = 'none';
    });
    $('jt-status-select').addEventListener('change', () => {
      if (!savedAppId) return;
      chrome.runtime.sendMessage({
        type: 'UPDATE_APPLICATION',
        id: savedAppId,
        data: { status: $('jt-status-select').value }
      }, () => void chrome.runtime.lastError);
    });

    $('jt-dashboard-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }, () => void chrome.runtime.lastError);
    });

    $('jt-cl-copy').addEventListener('click', () => {
      navigator.clipboard.writeText($('jt-cl-out').value).then(() => {
        const b = $('jt-cl-copy');
        b.textContent = 'Copied!';
        setTimeout(() => { b.textContent = 'Copy'; }, 2000);
      });
    });

    // Auto-expand and populate fields (with retry for SPA pages)
    expanded = true; // start expanded
    tryFillFields();
  }

  // SPA navigation — re-inject when the URL changes
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href === lastUrl) return;
    lastUrl    = location.href;
    savedAppId = null;
    expanded   = true;
    setTimeout(() => {
      const old = $('jt-banner');
      if (old) old.remove();
      injectBanner();
    }, 1200);
  }).observe(document.documentElement, { subtree: true, childList: true });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'FORCE_BANNER') {
      if ($('jt-banner')) return; // already visible
      buildBanner();
      makeDraggable($('jt-banner'), $('jt-tab'));
      $('jt-expand').addEventListener('click', e => { e.stopPropagation(); toggleWide(); });
      $('jt-tab').addEventListener('click', toggleBanner);
      $('jt-add-btn').addEventListener('click', onAddClick);
      $('jt-cl-btn').addEventListener('click', onCLClick);
      $('jt-analyze-btn').addEventListener('click', onAnalyzeClick);
      $('jt-cl-regen').addEventListener('click', onCLClick);
      $('jt-analyze-close').addEventListener('click', () => { $('jt-analyze-section').style.display = 'none'; });
      $('jt-cl-close').addEventListener('click', () => { $('jt-cl-section').style.display = 'none'; });
      $('jt-cl-copy').addEventListener('click', () => {
        navigator.clipboard.writeText($('jt-cl-out').value).then(() => {
          const b = $('jt-cl-copy'); b.textContent = 'Copied!';
          setTimeout(() => { b.textContent = 'Copy'; }, 2000);
        });
      });
      $('jt-status-select').addEventListener('change', () => {
        if (!savedAppId) return;
        chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION', id: savedAppId, data: { status: $('jt-status-select').value } }, () => void chrome.runtime.lastError);
      });
      $('jt-dashboard-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }, () => void chrome.runtime.lastError);
      });
      expanded = true;
      tryFillFields();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
