// Workday content script
// Handles *.myworkdayjobs.com application tracking

(function () {
  'use strict';

  let reported = false;

  function getJobDetails() {
    const role = getText([
      'h2[data-automation-id="jobPostingHeader"]',
      '.gwt-Label.WMQN4WCBBBB',
      'h1',
      '[data-automation-id="jobTitle"]'
    ]);

    // Company from subdomain: company.myworkdayjobs.com
    const subdomain = window.location.hostname.split('.')[0];
    const company = formatCompanyName(subdomain);

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
        platform: 'workday'
      }
    }, () => { void chrome.runtime.lastError; });
  }

  function checkForSuccess() {
    const successPatterns = [
      'Thank you for applying',
      'application has been submitted',
      'successfully applied',
      'Application Complete',
      'You have successfully submitted'
    ];

    const text = document.body.innerText || '';
    for (const pattern of successPatterns) {
      if (text.toLowerCase().includes(pattern.toLowerCase())) {
        reportApplication();
        return true;
      }
    }

    // Workday also uses a step indicator — look for final "submitted" step
    const submittedStep = document.querySelector(
      '[data-automation-id="completedSummaryStep"], [title="Submitted"]'
    );
    if (submittedStep) {
      reportApplication();
      return true;
    }

    return false;
  }

  function init() {
    if (checkForSuccess()) return;

    // Watch for DOM updates (Workday is a heavy SPA)
    const observer = new MutationObserver(() => {
      if (checkForSuccess()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 120000); // 2 min max
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
