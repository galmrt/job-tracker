const apiKeyInput  = document.getElementById('api-key');
const toggleBtn    = document.getElementById('toggle-key');
const modelSelect  = document.getElementById('model');
const uploadZone   = document.getElementById('upload-zone');
const fileInput    = document.getElementById('resume-file');
const parseStatus  = document.getElementById('parse-status');
const parseSpinner = document.getElementById('parse-spinner');
const parseMsg     = document.getElementById('parse-msg');
const resumeAnalysisEl = document.getElementById('resume-analysis');
const saveBtn      = document.getElementById('save-btn');
const saveStatus   = document.getElementById('save-status');

// ── Resume version state ──────────────────────────────────────────────────────

let resumeVersions = [];
let selectedVersionId = null;

// ── Load saved settings ───────────────────────────────────────────────────────

chrome.storage.local.get(
  ['groqApiKey', 'groqModel', 'resumeVersions', 'resumeAnalysis', 'resumeFileName'],
  result => {
    if (result.groqApiKey) apiKeyInput.value = result.groqApiKey;
    if (result.groqModel)  modelSelect.value = result.groqModel;

    // Migrate legacy single-resume storage
    let versions = result.resumeVersions || [];
    if (!versions.length && result.resumeAnalysis) {
      versions = [{
        id: crypto.randomUUID(),
        analysis: result.resumeAnalysis,
        filename: result.resumeFileName || 'resume',
        createdAt: new Date().toISOString(),
        isFavorite: true
      }];
      chrome.storage.local.set({ resumeVersions: versions });
      chrome.storage.local.remove(['resumeAnalysis', 'resumeFileName']);
    }

    resumeVersions = versions;
    if (versions.length) {
      uploadZone.style.display = 'none';
      renderResumeVersions();
      // Show analysis for the favorite (or first)
      const fav = versions.find(v => v.isFavorite) || versions[0];
      selectVersion(fav.id);
    }
  }
);

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

document.getElementById('add-resume-btn')?.addEventListener('click', () => {
  uploadZone.style.display = 'flex';
  document.getElementById('resume-versions-section').style.display = 'none';
  resumeAnalysisEl.style.display = 'none';
  parseStatus.style.display = 'none';
  fileInput.value = '';
});

async function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const allowed = ['pdf', 'docx', 'txt'];

  if (!allowed.includes(ext)) {
    showStatus('error', 'Unsupported file type. Please use PDF, DOCX, or TXT.');
    return;
  }

  showStatus('loading', 'Analyzing resume…');
  uploadZone.style.display = 'none';
  resumeAnalysisEl.style.display = 'none';

  try {
    let pdf = null;
    let text = null;

    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      pdf = btoa(binary);
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      text = result.value.trim();
    } else {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsText(file);
      });
      text = text.trim();
    }

    if (!pdf && !text) {
      showStatus('error', 'No content could be extracted from the file.');
      uploadZone.style.display = 'flex';
      return;
    }

    chrome.runtime.sendMessage({ type: 'ANALYZE_RESUME', pdf, text }, response => {
      if (chrome.runtime.lastError || !response) {
        showStatus('error', 'Extension error. Try reloading.');
        uploadZone.style.display = 'flex';
        return;
      }
      if (response.error) {
        showStatus('error', `Analysis failed: ${response.error}`);
        uploadZone.style.display = 'flex';
        return;
      }

      const analysis = response.result;
      const newVersion = {
        id: crypto.randomUUID(),
        analysis,
        filename: file.name,
        createdAt: new Date().toISOString(),
        isFavorite: resumeVersions.length === 0  // first upload = auto-favorite
      };

      resumeVersions.unshift(newVersion);
      chrome.storage.local.set({ resumeVersions }, () => {
        showStatus('success', `Resume analyzed: ${file.name}`);
        renderResumeVersions();
        selectVersion(newVersion.id);
      });
    });

  } catch (err) {
    showStatus('error', `Failed: ${err.message}`);
    uploadZone.style.display = 'flex';
  }
}

// ── Version list ──────────────────────────────────────────────────────────────

function renderResumeVersions() {
  const section = document.getElementById('resume-versions-section');
  const list    = document.getElementById('rv-list');

  if (!resumeVersions.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  list.innerHTML = resumeVersions.map(v => `
    <div class="rv-item ${v.id === selectedVersionId ? 'rv-selected' : ''}" data-id="${v.id}">
      <div class="rv-info">
        <div class="rv-name">${esc(v.filename)}</div>
        <div class="rv-date">${formatDate(v.createdAt)}</div>
      </div>
      <div class="rv-actions">
        <button class="rv-star ${v.isFavorite ? 'rv-star-active' : ''}"
          data-id="${v.id}" title="${v.isFavorite ? 'Favorite (used for cover letters)' : 'Set as favorite'}">
          ${v.isFavorite ? 'Saved' : 'Save'}
        </button>
        <button class="rv-delete" data-id="${v.id}" title="Delete this version">×</button>
      </div>
    </div>
  `).join('');
}

function selectVersion(versionId) {
  selectedVersionId = versionId;
  const version = resumeVersions.find(v => v.id === versionId);
  if (!version) return;

  renderResumeVersions(); // update active highlight
  showAnalysis(version.analysis, version.filename);
}

// Version list click delegation
document.getElementById('rv-list')?.addEventListener('click', e => {
  const starBtn   = e.target.closest('.rv-star');
  const deleteBtn = e.target.closest('.rv-delete');
  const item      = e.target.closest('.rv-item');

  if (starBtn) {
    e.stopPropagation();
    const id = starBtn.dataset.id;
    resumeVersions.forEach(v => { v.isFavorite = v.id === id; });
    chrome.storage.local.set({ resumeVersions }, () => renderResumeVersions());
    return;
  }

  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    if (resumeVersions.length === 1) {
      if (!confirm('Delete your only resume? You will need to upload a new one to use cover letter generation.')) return;
    } else {
      if (!confirm('Delete this resume version?')) return;
    }
    const wasFavorite = resumeVersions.find(v => v.id === id)?.isFavorite;
    resumeVersions = resumeVersions.filter(v => v.id !== id);
    // Promote first remaining to favorite if the deleted one was the favorite
    if (wasFavorite && resumeVersions.length) resumeVersions[0].isFavorite = true;
    chrome.storage.local.set({ resumeVersions }, () => {
      if (!resumeVersions.length) {
        document.getElementById('resume-versions-section').style.display = 'none';
        resumeAnalysisEl.style.display = 'none';
        uploadZone.style.display = 'flex';
        selectedVersionId = null;
      } else {
        const next = id === selectedVersionId
          ? (resumeVersions.find(v => v.isFavorite) || resumeVersions[0])
          : resumeVersions.find(v => v.id === selectedVersionId) || resumeVersions[0];
        selectedVersionId = next.id;
        renderResumeVersions();
        showAnalysis(next.analysis, next.filename);
      }
    });
    return;
  }

  if (item) selectVersion(item.dataset.id);
});

// ── Analysis display ──────────────────────────────────────────────────────────

function showAnalysis(analysis, filename) {
  document.getElementById('resume-versions-section').style.display = 'block';
  resumeAnalysisEl.style.display = 'block';

  document.getElementById('analysis-name').textContent = analysis.name || 'Resume';
  document.getElementById('analysis-meta').textContent = filename || '';
  document.getElementById('analysis-summary').textContent = analysis.summary || '';

  const skillsEl = document.getElementById('analysis-skills');
  skillsEl.innerHTML = (analysis.skills || [])
    .map(s => `<span class="badge skill-badge">${esc(s)}</span>`).join('');

  const expEl = document.getElementById('analysis-experience');
  expEl.innerHTML = (analysis.experience || []).map(e => `
    <div class="exp-item">
      <div class="exp-role">${esc(e.role)} <span class="exp-company">at ${esc(e.company)}</span></div>
      ${(e.highlights || []).map(h => `<div class="exp-highlight">• ${esc(h)}</div>`).join('')}
    </div>
  `).join('');

  const strengthsEl = document.getElementById('analysis-strengths');
  strengthsEl.innerHTML = (analysis.strengths || [])
    .map(s => `<span class="badge strength-badge">${esc(s)}</span>`).join('');
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    groqApiKey: key,
    groqModel:  modelSelect.value
  }, () => {
    saveBtn.disabled = false;
    saveStatus.textContent = 'Saved!';
    saveStatus.classList.add('visible');
    setTimeout(() => saveStatus.classList.remove('visible'), 2000);
  });
});
