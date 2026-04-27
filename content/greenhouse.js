// Greenhouse content script
// Handles boards.greenhouse.io and embedded Greenhouse forms

(function () {
  'use strict';

  // Capture job details eagerly at page load — before the DOM changes to the
  // success/thank-you page, which would overwrite h1 with "Thank you for applying"
  let capturedDetails = null;

  function captureJobDetails() {
    const role = getText([
      'h1.app-title',
      'h1.job-post-name',
      'h1[class*="title"]',
      '.job-post h1',
      'h1'
    ]);

    // Skip capturing if the page is already showing a success message
    const successTexts = ['thank you', 'successfully submitted', 'application has been received'];
    if (successTexts.some(t => role.toLowerCase().includes(t))) return;

    // Company from URL: boards.greenhouse.io/COMPANY/jobs/ID
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\//);
    const companyFromUrl = urlMatch ? formatCompanyName(urlMatch[1]) : '';

    const company = getText([
      '.company-name',
      '.employer-name',
      'h2.company'
    ]) || companyFromUrl;

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
    if (!chrome.runtime?.id) return;
    const details = capturedDetails || {};
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\//);

    chrome.runtime.sendMessage({
      type: 'JOB_APPLIED',
      data: {
        company: details.company || (urlMatch ? formatCompanyName(urlMatch[1]) : ''),
        role: details.role || '',
        url: window.location.href,
        platform: 'greenhouse'
      }
    }, () => { void chrome.runtime.lastError; });
  }

  let reported = false;

  function checkForSuccessPage() {
    if (reported) return;

    if (window.location.search.includes('success=true')) {
      reported = true;
      reportApplication();
      return;
    }

    const successPatterns = [
      'Thank you for your application',
      'successfully submitted',
      'application has been received',
      'We have received your application'
    ];

    const text = document.body.innerText || '';
    for (const pattern of successPatterns) {
      if (text.includes(pattern)) {
        reported = true;
        reportApplication();
        return;
      }
    }
  }

  function watchForm() {
    const form = document.querySelector('#application_form, form[action*="applications"]');
    if (!form || form.__ghTracked) return;
    form.__ghTracked = true;

    // Capture details right before submit (last chance before DOM changes)
    form.addEventListener('submit', () => {
      captureJobDetails();
      setTimeout(checkForSuccessPage, 1500);
    });
  }

  function init() {
    // Capture immediately on page load (job detail page)
    captureJobDetails();
    checkForSuccessPage();
    watchForm();

    const observer = new MutationObserver(() => {
      if (!capturedDetails) captureJobDetails();
      checkForSuccessPage();
      watchForm();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
