// Shared utilities for content scripts

function reportApplication(data) {
  chrome.runtime.sendMessage({ type: 'JOB_APPLIED', data }, () => {
    if (chrome.runtime.lastError) {
      // Extension context may have been invalidated — ignore
    }
  });
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

function watchForText(patterns, callback, timeout = 30000) {
  const check = () => {
    const text = document.body.innerText || '';
    for (const pattern of patterns) {
      if (typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text)) {
        return true;
      }
    }
    return false;
  };

  if (check()) {
    callback();
    return;
  }

  const observer = new MutationObserver(() => {
    if (check()) {
      observer.disconnect();
      callback();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(() => observer.disconnect(), timeout);
}

function getText(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return '';
}

// Export for use in content scripts via script injection
if (typeof window !== 'undefined') {
  window.__jobTrackerUtils = { reportApplication, waitForElement, watchForText, getText };
}
