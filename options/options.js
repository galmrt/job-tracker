const apiKeyInput = document.getElementById('api-key');
const toggleBtn   = document.getElementById('toggle-key');
const modelSelect = document.getElementById('model');
const saveBtn     = document.getElementById('save-btn');
const saveStatus  = document.getElementById('save-status');

// ── Load saved settings ───────────────────────────────────────────────────────

chrome.storage.local.get(['groqApiKey', 'groqModel'], result => {
  if (result.groqApiKey) apiKeyInput.value = result.groqApiKey;
  if (result.groqModel)  modelSelect.value = result.groqModel;
});

// ── API key toggle ────────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  const hidden = apiKeyInput.type === 'password';
  apiKeyInput.type = hidden ? 'text' : 'password';
  toggleBtn.textContent = hidden ? 'Hide' : 'Show';
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
    groqApiKey: key,
    groqModel:  modelSelect.value
  }, () => {
    saveBtn.disabled = false;
    saveStatus.textContent = 'Saved!';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2000);
  });
});
