// Lever content script
// Handles jobs.lever.co application tracking

(function () {
  'use strict';

  let reported = false;

  function getJobDetails() {
    const role = getText([
      'h2[data-qa="posting-name"]',
      '.posting-headline h2',
      'h2.posting-headline',
      'h2'
    ]);

    // Company from URL: jobs.lever.co/COMPANY/ID
    const urlMatch = window.location.pathname.match(/^\/([^/]+)\//);
    const company = urlMatch ? formatCompanyName(urlMatch[1]) : '';

    return { role, company };
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
    if (!chrome.runtime?.id) return;
    reported = true;

    const { role, company } = getJobDetails();
    chrome.runtime.sendMessage({
      type: 'JOB_APPLIED',
      data: {
        company,
        role,
        url: window.location.href,
        platform: 'lever'
      }
    }, () => { void chrome.runtime.lastError; });
  }

  function checkForSuccess() {
    // Lever redirects to /apply/thanks or shows a thank you message
    if (window.location.pathname.includes('/thanks')) {
      reportApplication();
      return true;
    }

    const successPatterns = [
      'Thanks for applying',
      'Thank you for applying',
      'application has been received',
      'successfully submitted your application'
    ];

    const text = document.body.innerText || '';
    for (const pattern of successPatterns) {
      if (text.includes(pattern)) {
        reportApplication();
        return true;
      }
    }
    return false;
  }

  function watchForm() {
    const form = document.querySelector('form#application-form, form[action*="apply"]');
    if (!form) return;

    form.addEventListener('submit', () => {
      setTimeout(checkForSuccess, 1500);
    });
  }

  function init() {
    if (checkForSuccess()) return;
    watchForm();

    const observer = new MutationObserver(() => {
      if (checkForSuccess()) observer.disconnect();
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
