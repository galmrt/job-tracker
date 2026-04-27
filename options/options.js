// Set pdf.js worker path to the local extension file
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
}

const apiKeyInput  = document.getElementById('api-key');
const toggleBtn    = document.getElementById('toggle-key');
const modelSelect  = document.getElementById('model');
const uploadZone   = document.getElementById('upload-zone');
const fileInput    = document.getElementById('resume-file');
const parseStatus  = document.getElementById('parse-status');
const parseSpinner = document.getElementById('parse-spinner');
const parseMsg     = document.getElementById('parse-msg');
const resumeField  = document.getElementById('resume-field');
const resumeText   = document.getElementById('resume-text');
const resumeMeta   = document.getElementById('resume-meta');
const charCount    = document.getElementById('char-count');
const saveBtn      = document.getElementById('save-btn');
const saveStatus   = document.getElementById('save-status');

// ── Load saved settings ───────────────────────────────────────────────────────

chrome.storage.local.get(['groqApiKey', 'groqModel', 'resumeSnippet', 'resumeFileName'], result => {
  if (result.groqApiKey) apiKeyInput.value = result.groqApiKey;
  if (result.groqModel)  modelSelect.value = result.groqModel;
  if (result.resumeSnippet) {
    resumeText.value = result.resumeSnippet;
    resumeField.style.display = 'block';
    if (result.resumeFileName) {
      showStatus('success', `Loaded: ${result.resumeFileName}`);
      resumeMeta.textContent = result.resumeFileName;
    }
    updateCharCount();
  }
});

// ── API key toggle ────────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  const hidden = apiKeyInput.type === 'password';
  apiKeyInput.type = hidden ? 'text' : 'password';
  toggleBtn.textContent = hidden ? 'Hide' : 'Show';
});

// ── File upload ───────────────────────────────────────────────────────────────

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));

uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const allowed = ['pdf', 'docx', 'txt'];

  if (!allowed.includes(ext)) {
    showStatus('error', 'Unsupported file type. Please use PDF, DOCX, or TXT.');
    return;
  }

  showStatus('loading', `Extracting text from ${file.name}…`);
  resumeField.style.display = 'none';

  try {
    let text = '';
    if (ext === 'pdf')  text = await extractPDF(file);
    if (ext === 'docx') text = await extractDOCX(file);
    if (ext === 'txt')  text = await extractTXT(file);

    text = text.trim();
    if (!text) {
      showStatus('error', 'No text could be extracted. The file may be image-based or encrypted.');
      return;
    }

    resumeText.value = text;
    resumeMeta.textContent = `${file.name} · ${text.length.toLocaleString()} chars`;
    resumeField.style.display = 'block';
    updateCharCount();
    showStatus('success', `Extracted ${text.length.toLocaleString()} characters from ${file.name}`);

    // Store the filename for display on next load
    chrome.storage.local.set({ resumeFileName: file.name });
  } catch (err) {
    showStatus('error', `Extraction failed: ${err.message}`);
  }
}

// ── Extractors ────────────────────────────────────────────────────────────────

async function extractPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s{2,}/g, ' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extractDOCX(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractTXT(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file);
  });
}

// ── Char count ────────────────────────────────────────────────────────────────

resumeText.addEventListener('input', updateCharCount);
function updateCharCount() {
  charCount.textContent = `${resumeText.value.length.toLocaleString()} characters`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function showStatus(type, msg) {
  parseStatus.className = `parse-status ${type}`;
  parseStatus.style.display = 'flex';
  parseSpinner.style.display = type === 'loading' ? 'block' : 'none';
  parseMsg.textContent = msg;
}

// ── Save ──────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.focus();
    return;
  }

  saveBtn.disabled = true;
  chrome.storage.local.set({
    groqApiKey:    key,
    groqModel:     modelSelect.value,
    resumeSnippet: resumeText.value.trim()
  }, () => {
    saveBtn.disabled = false;
    saveStatus.textContent = 'Saved!';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2000);
  });
});
