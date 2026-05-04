const apiKeyInput  = document.getElementById('api-key');
const toggleBtn    = document.getElementById('toggle-key');
const modelSelect  = document.getElementById('model');
const cfUrlInput   = document.getElementById('cf-url');
const cfTokenInput = document.getElementById('cf-token');
const toggleCFBtn  = document.getElementById('toggle-cf-token');
const saveBtn      = document.getElementById('save-btn');
const saveStatus   = document.getElementById('save-status');

// ── Load saved settings ───────────────────────────────────────────────────────

chrome.storage.local.get(['groqApiKey', 'groqModel', 'cfWorkerUrl', 'cfToken'], result => {
  if (result.groqApiKey)   apiKeyInput.value  = result.groqApiKey;
  if (result.groqModel)    modelSelect.value  = result.groqModel;
  if (result.cfWorkerUrl)  cfUrlInput.value   = result.cfWorkerUrl;
  if (result.cfToken)      cfTokenInput.value = result.cfToken;
});

// ── Toggle visibility ─────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  const hidden = apiKeyInput.type === 'password';
  apiKeyInput.type = hidden ? 'text' : 'password';
  toggleBtn.textContent = hidden ? 'Hide' : 'Show';
});

toggleCFBtn.addEventListener('click', () => {
  const hidden = cfTokenInput.type === 'password';
  cfTokenInput.type = hidden ? 'text' : 'password';
  toggleCFBtn.textContent = hidden ? 'Hide' : 'Show';
});

// ── Save ──────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.focus();
    return;
  }

  saveBtn.disabled = true;
  chrome.storage.local.set({
    groqApiKey:   key,
    groqModel:    modelSelect.value,
    cfWorkerUrl:  cfUrlInput.value.trim(),
    cfToken:      cfTokenInput.value.trim()
  }, () => {
    saveBtn.disabled = false;
    saveStatus.textContent = 'Saved!';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2000);
  });
});
