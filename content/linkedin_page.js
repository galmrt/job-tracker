// Runs in MAIN world (page context) — can intercept window.fetch
// Communicates back to the isolated content script via CustomEvent

(function () {
  'use strict';

  window.__jobTrackerLoaded = true;
  console.log('[JobTracker PAGE] interceptors active');

  // ── Intercept fetch ───────────────────────────────────────────────────────

  const _fetch = window.fetch.bind(window);
  window.fetch = function (...args) {
    const req = args[0];
    const options = args[1] || {};
    const url = typeof req === 'string' ? req : (req?.url || '');
    const method = (options.method || req?.method || 'GET').toUpperCase();

    const isApplyPost =
      method === 'POST' &&
      /onsite-apply\.server-action/i.test(url);

    if (isApplyPost) {
      return _fetch(...args).then(response => {
        if (response.ok || response.status === 201) {
          response.clone().text().then(text => {
            // "OnsiteApplying" = modal opened/draft saved, "Applied" = actually submitted
            if (!text.includes('"stringValue":"Applied"')) return;
            if (text.includes('OnsiteApplying')) return;

            const jobIdMatch = text.match(/jdpApplyState_(\d+)/);
            const jobId = jobIdMatch ? jobIdMatch[1] : null;
            console.log('[JobTracker PAGE] application confirmed in response, jobId:', jobId);

            document.dispatchEvent(new CustomEvent('__jobTrackerApplied', {
              detail: { href: window.location.href, jobId }
            }));
          });
        }
        return response;
      });
    }

    return _fetch(...args);
  };

  // ── Intercept XHR ─────────────────────────────────────────────────────────

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__jt_method = method;
    this.__jt_url = url;
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    return _send.apply(this, arguments);
  };
})();
