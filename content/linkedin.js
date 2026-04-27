// LinkedIn content script
// Detection strategy:
//   1. Fetch interceptor — catches the Easy Apply POST request (most reliable)
//   2. URL change to /post-apply/ — works in collections/recommended view
//   3. Toast/modal text — fallback

(function () {
  'use strict';

  let lastTrackedJobId = null;
  let pendingApplication = null;

  // ── Job detail extraction ─────────────────────────────────────────────────

  function getJobDetails() {
    console.log('[JobTracker] getJobDetails, document.title:', document.title);

    // Primary: document.title is "Role | Company | LinkedIn" when a job is selected
    const titleParts = document.title.split(' | ');
    if (titleParts.length >= 3 && titleParts[titleParts.length - 1].trim() === 'LinkedIn') {
      const details = { role: titleParts[0].trim(), company: titleParts[1].trim() };
      console.log('[JobTracker] title parse success:', details);
      return details;
    }

    console.log('[JobTracker] title parse failed, trying DOM selectors');

    // Fallback: DOM selectors
    const role = getText([
      'a[href*="/jobs/view/"]',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title h2',
      'h1.t-24', 'h2.t-24'
    ]);

    const company = getText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name span',
      '.jobs-unified-top-card__company-name a'
    ]);

    console.log('[JobTracker] DOM selectors result — role:', role || '(empty)', '| company:', company || '(empty)');

    return { role, company };
  }

  function getText(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) return el.textContent.trim();
      } catch {}
    }
    return '';
  }

  function getJobIdFromUrl(url) {
    const src = url || window.location.href;
    const match = src.match(/[?&](?:currentJobId|postApplyJobId)=(\d+)/);
    return match ? match[1] : null;
  }

  function buildJobUrl(jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  function reportApplication(sourceUrl, explicitJobId) {
    const jobId = explicitJobId || getJobIdFromUrl(sourceUrl) || getJobIdFromUrl();
    console.log('[JobTracker] reportApplication, jobId:', jobId);
    if (!jobId) return;
    lastTrackedJobId = jobId;

    const details = pendingApplication || getJobDetails();
    console.log('[JobTracker] Sending:', details);

    if (!chrome.runtime?.id) {
      console.warn('[JobTracker] Extension context invalidated — refresh the tab.');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'JOB_APPLIED',
      data: {
        company: details.company || '',
        role: details.role || '',
        url: buildJobUrl(jobId),
        platform: 'linkedin'
      }
    }, () => { void chrome.runtime.lastError; });

    pendingApplication = null;
  }

  // ── DETECTION 1: Fetch interceptor (via MAIN world script) ──────────────
  // linkedin_page.js parses the response body and only fires this event
  // when "stringValue":"Applied" is confirmed in the server response.

  document.addEventListener('__jobTrackerApplied', (e) => {
    const jobId = e.detail?.jobId;
    console.log('[JobTracker] confirmed application, jobId:', jobId);


    reportApplication(e.detail?.href, jobId);
  });

  // ── DETECTION 2: URL change to /post-apply/ ───────────────────────────────

  function isPostApplyUrl(url) {
    return /\/post-apply\//.test(url || window.location.pathname);
  }

  function watchUrlChanges() {
    let lastUrl = window.location.href;

    const check = () => {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;

      const wasOnJobPage = lastUrl.includes('currentJobId');
      const isNowPostApply = isPostApplyUrl(currentUrl);

      if (wasOnJobPage && isNowPostApply) {
        console.log('[JobTracker] post-apply URL detected');
        reportApplication(currentUrl);
      }

      if (!currentUrl.includes('currentJobId') && !isPostApplyUrl(currentUrl)) {
        pendingApplication = null;
      }

      lastUrl = currentUrl;
    };

    new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
    setInterval(check, 500);
  }

  // ── DETECTION 3: Toast / modal text ──────────────────────────────────────

  const SUCCESS_PHRASES = [
    'your application was sent',
    'application submitted',
    'you applied',
    'successfully applied'
  ];

  function isSuccessText(text) {
    const lower = (text || '').toLowerCase();
    return SUCCESS_PHRASES.some(p => lower.includes(p));
  }

  function watchForSuccessSignals() {
    const observer = new MutationObserver(() => {
      // Toast
      for (const sel of ['.artdeco-toast-item', '[data-test-artdeco-toast-item]', '[class*="toast"]']) {
        const el = document.querySelector(sel);
        if (el && isSuccessText(el.innerText)) {
          console.log('[JobTracker] toast success:', el.innerText.trim());
          reportApplication();
          return;
        }
      }
      // Modal
      const modal = document.querySelector(
        '[data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-modal'
      );
      if (modal && isSuccessText(modal.innerText)) {
        console.log('[JobTracker] modal success detected');
        reportApplication();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Capture details at Easy Apply click ──────────────────────────────────

  function watchEasyApplyButton() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
      const isEasyApply =
        label.includes('easy apply') ||
        btn.classList.contains('jobs-apply-button') ||
        btn.getAttribute('data-control-name') === 'jobdetails_topcard_inapply';

      if (!isEasyApply) {
        console.log('[JobTracker] button click ignored (not Easy Apply):', label.slice(0, 60));
        return;
      }

      const details = getJobDetails();
      details.url = window.location.href;
      pendingApplication = details;
      console.log('[JobTracker] Easy Apply clicked, captured:', pendingApplication);
    }, true);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    console.log('[JobTracker] loaded on:', window.location.href);

    if (isPostApplyUrl(window.location.href)) {
      reportApplication();
    }

    watchEasyApplyButton();
    watchUrlChanges();
    watchForSuccessSignals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
