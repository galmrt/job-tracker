// Generic content script
// Runs on all pages and detects job application submissions on company-specific sites
// Only activates when job-related content is detected

(function () {
  'use strict';

  // Skip known platforms handled by dedicated scripts
  const KNOWN_PLATFORMS = [
    'linkedin.com',
    'greenhouse.io',
    'myworkdayjobs.com',
    'jobs.lever.co',
    'jobs.ashbyhq.com'
  ];

  const hostname = window.location.hostname;
  if (KNOWN_PLATFORMS.some(p => hostname.includes(p))) return;

  let reported = false;

  // Keywords that suggest this page is a job application
  const JOB_PAGE_SIGNALS = [
    /apply/i, /application/i, /resume/i, /cv/i, /cover.?letter/i,
    /job/i, /career/i, /position/i, /opportunity/i
  ];

  // Strong signal: the URL itself contains career/jobs/hiring anywhere
  // Catches metacareers.com, careers.ibm.com, google.com/about/careers/, somecompany.com/careers, etc.
  function isCareerSite() {
    const url = window.location.href.toLowerCase();
    return /career|\/jobs\/|\bjobs\.|hiring/.test(url);
  }

  // Keywords that suggest a successful submission
  const SUCCESS_SIGNALS = [
    'thank you for applying',
    'thank you for your application',
    'thanks for applying',
    'thanks for your application',
    'application received',
    'application submitted',
    'application complete',
    'successfully submitted',
    'successfully applied',
    'we have received your application',
    'we received your application',
    'we\'ll be in touch',
    'we will be in touch',
    'application has been sent',
    'application has been submitted',
    'you have applied',
    'you\'ve applied',
    'your application has been',
    'your application was',
  ];

  function isJobPage() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const metaDesc = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || '';
    const bodySnippet = (document.body?.innerText || '').slice(0, 3000).toLowerCase();
    const combined = url + title + metaDesc + bodySnippet;
    const matched = JOB_PAGE_SIGNALS.find(rx => rx.test(combined));
    if (matched) console.log('[JobTracker] isJobPage matched signal:', matched);
    return !!matched;
  }

  function detectSuccess() {
    const text = (document.body.innerText || '').toLowerCase();
    const matched = SUCCESS_SIGNALS.find(s => text.includes(s));
    if (matched) console.log('[JobTracker] success signal detected:', matched);
    return !!matched;
  }

  function getJobDetails() {
    const role = getText([
      'h1', 'h2',
      '[class*="job-title"]',
      '[class*="position"]',
      '[id*="job-title"]',
      'title'
    ]);

    const company = getCompanyName();
    return { role: role.split('\n')[0].trim(), company };
  }

  function getText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim() || el?.getAttribute('content')?.trim();
      if (text) return text;
    }
    return '';
  }

  function getCompanyName() {
    // Try structured data
    const ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson) {
      try {
        const data = JSON.parse(ldJson.textContent);
        if (data.hiringOrganization?.name) return data.hiringOrganization.name;
        if (data.name && data['@type'] === 'Organization') return data.name;
      } catch {}
    }

    // Try meta tags
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.content;
    if (ogSiteName) return ogSiteName;

    // Fall back to domain
    return hostname.replace('www.', '').split('.')[0]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function reportApplication() {
    if (reported) return;
    if (!chrome.runtime?.id) {
      console.warn('[JobTracker] Extension context invalidated — refresh the tab.');
      return;
    }
    reported = true;

    const { role, company } = getJobDetails();
    console.log('[JobTracker] Sending application:', { company, role, url: window.location.href });

    chrome.runtime.sendMessage({
      type: 'JOB_APPLIED',
      data: {
        company,
        role,
        url: window.location.href,
        platform: 'generic'
      }
    }, () => { void chrome.runtime.lastError; });
  }

  // Intercept fetch and XHR to catch SPA-style application submissions
  // that never fire a form submit event
  function interceptNetwork() {
    console.log('[JobTracker] network interception active');
    const APPLY_URL_PATTERN = /apply|application|submit|candidate/i;

    function shouldIntercept(method, url) {
      if (method !== 'POST') return false;
      // On a known career site, any POST is worth watching
      if (isCareerSite()) return true;
      // On any other site, only watch endpoints that look apply-related
      return APPLY_URL_PATTERN.test(url);
    }

    function onSuccessfulPost(url) {
      console.log('[JobTracker] intercepted successful POST:', url);
      setTimeout(() => {
        if (isCareerSite() || isJobPage()) reportApplication();
        else console.log('[JobTracker] POST intercepted but page does not look like a job page — skipping');
      }, 1500);
    }

    // Intercept fetch
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const method = (args[1]?.method || 'GET').toUpperCase();
      if (shouldIntercept(method, url)) {
        console.log('[JobTracker] watching fetch POST:', url);
        return origFetch.apply(this, args).then(res => {
          if (res.ok) onSuccessfulPost(url);
          else console.log('[JobTracker] fetch POST failed, status:', res.status);
          return res;
        });
      }
      return origFetch.apply(this, args);
    };

    // Intercept XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__jobMethod = method;
      this.__jobUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (shouldIntercept((this.__jobMethod || '').toUpperCase(), this.__jobUrl || '')) {
        const url = this.__jobUrl;
        console.log('[JobTracker] watching XHR POST:', url);
        this.addEventListener('load', () => {
          if (this.status >= 200 && this.status < 300) onSuccessfulPost(url);
          else console.log('[JobTracker] XHR POST failed, status:', this.status);
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  function watchForms() {
    document.querySelectorAll('form').forEach(form => {
      if (form.__jobTrackerWatched) return;
      form.__jobTrackerWatched = true;

      const hasFileInput = form.querySelector('input[type="file"]');
      const formText = (form.textContent || '').toLowerCase();
      const isJobForm = hasFileInput || JOB_PAGE_SIGNALS.some(rx => rx.test(formText));

      if (isJobForm) {
        console.log('[JobTracker] job form found, watching for submit');
        form.addEventListener('submit', () => {
          console.log('[JobTracker] form submitted, waiting for success signal...');
          setTimeout(() => {
            if (detectSuccess()) reportApplication();
            else console.log('[JobTracker] no success signal after form submit');
          }, 2000);
        });
      }
    });
  }

  // Watch for SPA URL changes (pushState / popState)
  function watchUrlChanges() {
    let lastUrl = window.location.href;
    let networkIntercepted = false;

    const onUrlChange = () => {
      const current = window.location.href;
      if (current === lastUrl) return;
      console.log('[JobTracker] URL changed:', lastUrl, '→', current);
      lastUrl = current;

      setTimeout(() => {
        // Only use URL-based signal here — never content-based (isJobPage).
        // Content-based checks on URL changes cause false positives on email
        // clients (Gmail etc.) where the email body may contain job keywords.
        if (!networkIntercepted && isCareerSite()) {
          interceptNetwork();
          networkIntercepted = true;
        }
        if (networkIntercepted && detectSuccess()) reportApplication();
        if (networkIntercepted) watchForms();
      }, 1000);
    };

    const origPushState = history.pushState;
    history.pushState = function () {
      origPushState.apply(this, arguments);
      onUrlChange();
    };

    window.addEventListener('popstate', onUrlChange);
  }

  function init() {
    console.log('[JobTracker] generic loaded on:', window.location.href);

    const careerSite = isCareerSite();
    const jobPage = isJobPage();
    console.log('[JobTracker] isCareerSite:', careerSite, '| isJobPage:', jobPage);

    watchUrlChanges();

    if (!careerSite && !jobPage) {
      console.log('[JobTracker] not a career/job page — standing by (URL changes still watched)');
      return;
    }

    interceptNetwork();

    if (detectSuccess()) {
      reportApplication();
      return;
    }

    watchForms();

    const observer = new MutationObserver(() => {
      if (detectSuccess()) {
        reportApplication();
        observer.disconnect();
        return;
      }
      watchForms();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
