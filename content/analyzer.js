// JD Analyzer — injects a floating "Analyze" button and slide-in sidebar on job pages

(function () {
  'use strict';

  // Don't run in iframes
  if (window.self !== window.top) return;

  // Inject stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/analyzer.css');
  document.documentElement.appendChild(link);

  // ── JD Extraction ────────────────────────────────────────────────────────────

  const JD_SELECTORS = [
    // Workday
    '[data-automation-id="jobPostingDescription"]',
    // Greenhouse
    '#content', '.job-post',
    // Lever
    '.posting-description',
    // Ashby
    '[class*="job-description"]', '[class*="jobDescription"]',
    // LinkedIn
    '.jobs-description-content__text', '.jobs-description__content',
    // Generic
    '[id*="job-description"]', '[id*="jobDescription"]',
    '[class*="job-details"]', '[class*="jobDetails"]',
    'article', 'main'
  ];

  function extractJD() {
    for (const sel of JD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText.trim();
        if (text.length > 200) return text.slice(0, 8000); // cap to avoid huge prompts
      }
    }
    return document.body.innerText.slice(0, 8000);
  }

  // ── Button ───────────────────────────────────────────────────────────────────

  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'jt-analyze-btn';
    btn.innerHTML = `<span class="jt-icon"></span> Analyze Job`;
    btn.addEventListener('click', onAnalyzeClick);
    document.body.appendChild(btn);
    return btn;
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────────

  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'jt-sidebar';
    sidebar.innerHTML = `
      <div class="jt-sidebar-header">
        <div class="jt-sidebar-title">Job Analysis</div>
        <button class="jt-close-btn" id="jt-close-btn" title="Close">&times;</button>
      </div>
      <div class="jt-sidebar-body" id="jt-sidebar-body"></div>
      <div class="jt-footer">Powered by Groq &middot; Job Tracker</div>
    `;
    document.body.appendChild(sidebar);

    sidebar.querySelector('#jt-close-btn').addEventListener('click', closeSidebar);
    return sidebar;
  }

  function openSidebar() {
    document.getElementById('jt-sidebar').classList.add('open');
  }

  function closeSidebar() {
    document.getElementById('jt-sidebar').classList.remove('open');
  }

  function setBody(html) {
    document.getElementById('jt-sidebar-body').innerHTML = html;
  }

  function showLoading() {
    setBody(`
      <div class="jt-loading">
        <div class="jt-spinner"></div>
        <span>Analyzing job description…</span>
      </div>
    `);
  }

  function showError(msg) {
    setBody(`<div class="jt-error">${msg}</div>`);
  }

  function showResult(data) {
    const requiredBadges = (data.required_skills || [])
      .map(s => `<span class="jt-badge required">${esc(s)}</span>`).join('');
    const niceBadges = (data.nice_to_have || [])
      .map(s => `<span class="jt-badge nice">${esc(s)}</span>`).join('');
    const topicBadges = (data.interview_topics || [])
      .map(s => `<span class="jt-badge topic">${esc(s)}</span>`).join('');

    setBody(`
      ${data.summary ? `
        <div class="jt-section">
          <div class="jt-section-title">Summary</div>
          <div class="jt-summary">${esc(data.summary)}</div>
        </div>` : ''}

      ${data.seniority ? `
        <div class="jt-section">
          <div class="jt-section-title">Seniority Level</div>
          <div class="jt-seniority">${esc(data.seniority)}</div>
        </div>` : ''}

      ${requiredBadges ? `
        <div class="jt-section">
          <div class="jt-section-title">Required Skills</div>
          <div class="jt-badge-row">${requiredBadges}</div>
        </div>` : ''}

      ${niceBadges ? `
        <div class="jt-section">
          <div class="jt-section-title">Nice to Have</div>
          <div class="jt-badge-row">${niceBadges}</div>
        </div>` : ''}

      ${topicBadges ? `
        <div class="jt-section">
          <div class="jt-section-title">Likely Interview Topics</div>
          <div class="jt-badge-row">${topicBadges}</div>
        </div>` : ''}
    `);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  // ── Cache ─────────────────────────────────────────────────────────────────────

  let cachedResult = null;
  let cachedUrl = null;

  // ── Analyze handler ──────────────────────────────────────────────────────────

  async function onAnalyzeClick() {
    openSidebar();

    // Return cached result if URL hasn't changed
    if (cachedResult && cachedUrl === location.href) {
      showResult(cachedResult);
      return;
    }

    showLoading();

    const jdText = extractJD();

    try {
    chrome.runtime.sendMessage(
      { type: 'ANALYZE_JD', text: jdText },
      response => {
        if (chrome.runtime.lastError) {
          showError('Extension error. Try reloading the page.');
          return;
        }
        if (response.error) {
          if (response.error === 'NO_API_KEY') {
            showError(
              'No Groq API key set. ' +
              '<a href="#" id="jt-open-settings">Open Settings</a> to add one.'
            );
            // Attach settings link after render
            setTimeout(() => {
              const link = document.getElementById('jt-open-settings');
              if (link) link.addEventListener('click', e => {
                e.preventDefault();
                chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, () => void chrome.runtime.lastError);
              });
            }, 50);
          } else {
            showError(`Error: ${response.error}`);
          }
          return;
        }
        cachedResult = response.result;
        cachedUrl = location.href;
        showResult(response.result);
      }
    );
    } catch (e) {
      showError('Extension was updated. Please reload the page.');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    if (document.getElementById('jt-analyze-btn')) return; // already injected
    createButton();
    createSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
