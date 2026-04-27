// Ashby content script
// Handles jobs.ashbyhq.com application tracking
// URL pattern: jobs.ashbyhq.com/COMPANY/JOB-ID[/application]

(function () {
  'use strict';

  let reported = false;

  // Capture job details eagerly before the confirmation screen replaces the DOM
  let capturedDetails = null;

  function captureJobDetails() {
    const role = getText([
      'h1[class*="JobPosting"]',
      'h1[class*="job-title"]',
      'h1[class*="title"]',
      '.ashby-job-posting-brief-title',
      'h1'
    ]);

    // Skip if already on success screen
    if (!role || /thank|submitted|received/i.test(role)) return;

    // Company from URL: jobs.ashbyhq.com/COMPANY/...
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\//);
    const company = urlMatch ? formatCompanyName(urlMatch[1]) : getText([
      '[class*="company-name"]',
      '[class*="CompanyName"]'
    ]);

    if (role || company) {
      capturedDetails = { role, company };
    }
  }

  function getText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function formatCompanyName(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function reportApplication() {
    if (reported) return;
    reported = true;

    const details = capturedDetails || {};
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\//);

    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({
      type: 'JOB_APPLIED',
      data: {
        company: details.company || (urlMatch ? formatCompanyName(urlMatch[1]) : ''),
        role: details.role || '',
        url: window.location.href,
        platform: 'ashby'
      }
    }, () => { void chrome.runtime.lastError; });
  }

  function checkForSuccess() {
    // Ashby shows confirmation inline (SPA — URL may not change)
    const successPatterns = [
      'application submitted',
      'thank you for applying',
      'thank you for your application',
      'successfully submitted',
      'we\'ve received your application',
      'application has been received'
    ];

    const text = (document.body.innerText || '').toLowerCase();
    for (const pattern of successPatterns) {
      if (text.includes(pattern)) {
        reportApplication();
        return true;
      }
    }

    // Some Ashby flows redirect to a ?referenceId= or /confirmation path
    if (
      window.location.pathname.includes('/confirmation') ||
      window.location.search.includes('referenceId')
    ) {
      reportApplication();
      return true;
    }

    return false;
  }

  function watchForm() {
    // Ashby uses React — find submit buttons rather than a raw <form>
    const submitBtn = document.querySelector(
      'button[type="submit"], button[class*="submit"], button[class*="Submit"]'
    );
    if (!submitBtn || submitBtn.__ashbyTracked) return;
    submitBtn.__ashbyTracked = true;

    submitBtn.addEventListener('click', () => {
      // Snapshot details at click time before React re-renders
      captureJobDetails();
      setTimeout(checkForSuccess, 2000);
      setTimeout(checkForSuccess, 4000); // second attempt for slow networks
    });
  }

  function init() {
    captureJobDetails();
    if (checkForSuccess()) return;

    // Ashby is a React SPA — watch for route and DOM changes
    const observer = new MutationObserver(() => {
      if (!capturedDetails) captureJobDetails();
      if (checkForSuccess()) {
        observer.disconnect();
        return;
      }
      watchForm();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    watchForm();
    setTimeout(() => observer.disconnect(), 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
