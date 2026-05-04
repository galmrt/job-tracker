// Dashboard script

const STATUS_OPTIONS = {
  need_to_apply: 'Need to Apply',
  applied:      'Applied',
  phone_screen: 'Phone Screen',
  interview:    'Interview',
  offer:        'Offer',
  rejected:     'Rejected',
  withdrawn:    'Withdrawn'
};

const PLATFORM_COLORS = {
  linkedin:   'platform-linkedin',
  greenhouse: 'platform-greenhouse',
  workday:    'platform-workday',
  lever:      'platform-lever',
  ashby:      'platform-ashby',
  generic:    'platform-generic'
};

let allApplications = [];
let currentFilter = 'all';
let searchQuery = '';

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadApplications() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS' }, response => {
      resolve(response?.applications || []);
    });
  });
}

async function saveNewApplication(data) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'ADD_APPLICATION', data }, response => {
      resolve(response?.application);
    });
  });
}

async function updateApp(id, updates) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'UPDATE_APPLICATION', id, updates }, () => resolve());
  });
}

async function deleteApp(id) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'DELETE_APPLICATION', id }, () => resolve());
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function getFilteredApps() {
  return allApplications.filter(app => {
    const matchesFilter = currentFilter === 'all' || app.status === currentFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      app.company.toLowerCase().includes(q) ||
      app.role.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });
}

function renderTable() {
  const apps = getFilteredApps();
  const tbody = document.getElementById('table-body');
  const emptyState = document.getElementById('empty-state');
  const tableWrap = document.querySelector('.table');

  if (apps.length === 0) {
    tableWrap.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }

  tableWrap.style.display = 'table';
  emptyState.style.display = 'none';

  tbody.innerHTML = apps.map(app => `
    <tr data-id="${app.id}" class="status-row-${app.status}">
      <td><div class="company-name">${esc(app.company) || '<span class="unknown">Unknown</span>'}</div></td>
      <td><div class="role-name" title="${esc(app.role)}">${esc(app.role) || '<span class="unknown">Unknown</span>'}</div></td>
      <td>
        ${app.url
          ? `<a class="job-url" href="${esc(app.url)}" target="_blank" title="${esc(app.url)}">
               <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink:0">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
               </svg>
               ${esc(urlDomain(app.url))}
             </a>`
          : '<span class="unknown">—</span>'}
      </td>
      <td>
        <span class="platform-badge ${PLATFORM_COLORS[app.platform] || 'platform-generic'}">
          ${esc(app.platform)}
        </span>
      </td>
      <td><span class="date-text">${formatDate(app.appliedAt)}</span></td>
      <td>
        <select class="status-select status-${app.status}" data-id="${app.id}">
          ${Object.entries(STATUS_OPTIONS).map(([val, label]) =>
            `<option value="${val}" ${app.status === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <div class="notes-text" title="${esc(app.notes || '')}">${esc(app.notes) || '<span class="unknown">—</span>'}</div>
      </td>
      <td>
        <div class="row-actions">
          <button class="icon-btn edit-btn" data-id="${app.id}" title="Edit">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="icon-btn delete-btn delete" data-id="${app.id}" title="Delete">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </td>
      <td>
        <button class="icon-btn cover-letter-btn ${(app.coverLetters || []).length ? 'has-cl' : ''}"
          data-id="${app.id}"
          title="${(app.coverLetters || []).length ? `${app.coverLetters.length} cover letter(s)` : 'Generate Cover Letter'}">CL</button>
      </td>
    </tr>
  `).join('');
}

function renderStats() {
  const apps = allApplications;
  const active = apps.filter(a => ['applied', 'phone_screen', 'interview'].includes(a.status)).length;
  const offers = apps.filter(a => a.status === 'offer').length;
  const rejected = apps.filter(a => a.status === 'rejected').length;

  document.getElementById('stat-total').textContent = apps.length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-offer').textContent = offers;
  document.getElementById('stat-rejected').textContent = rejected;
}

function renderNavCounts() {
  const counts = { all: allApplications.length };
  Object.keys(STATUS_OPTIONS).forEach(s => {
    counts[s] = allApplications.filter(a => a.status === s).length;
  });

  Object.entries(counts).forEach(([key, count]) => {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = count;
  });
}

function renderAll() {
  renderStats();
  renderNavCounts();
  renderTable();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

function urlDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(app = null) {
  document.getElementById('modal-title').textContent = app ? 'Edit Application' : 'Add Application';
  document.getElementById('form-id').value = app?.id || '';
  document.getElementById('form-company').value = app?.company || '';
  document.getElementById('form-role').value = app?.role || '';
  document.getElementById('form-url').value = app?.url || '';
  document.getElementById('form-platform').value = app?.platform || 'generic';
  document.getElementById('form-status').value = app?.status || 'applied';
  document.getElementById('form-notes').value = app?.notes || '';
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('form-company').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ── Events ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});

document.getElementById('search').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderTable();
});

document.getElementById('add-btn').addEventListener('click', () => openModal());
document.getElementById('add-empty-btn')?.addEventListener('click', () => openModal());
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('app-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('form-id').value;
  const data = {
    company:  document.getElementById('form-company').value.trim(),
    role:     document.getElementById('form-role').value.trim(),
    url:      document.getElementById('form-url').value.trim(),
    platform: document.getElementById('form-platform').value,
    status:   document.getElementById('form-status').value,
    notes:    document.getElementById('form-notes').value.trim()
  };

  if (id) {
    await updateApp(id, data);
    const idx = allApplications.findIndex(a => a.id === id);
    if (idx !== -1) allApplications[idx] = { ...allApplications[idx], ...data };
  } else {
    const app = await saveNewApplication(data);
    if (app) allApplications.unshift(app);
  }

  closeModal();
  renderAll();
});

// Table delegation
document.getElementById('table-body').addEventListener('change', async e => {
  if (!e.target.matches('.status-select')) return;
  const id = e.target.dataset.id;
  const status = e.target.value;
  await updateApp(id, { status });
  const app = allApplications.find(a => a.id === id);
  if (app) app.status = status;
  // Update select color class and row class
  e.target.className = `status-select status-${status}`;
  e.target.closest('tr').className = `status-row-${status}`;
  renderStats();
  renderNavCounts();
});

document.getElementById('table-body').addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (editBtn) {
    const app = allApplications.find(a => a.id === editBtn.dataset.id);
    if (app) openModal(app);
  }

  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    const app = allApplications.find(a => a.id === id);
    if (app && confirm(`Delete application to "${app.role}" at "${app.company}"?`)) {
      await deleteApp(id);
      allApplications = allApplications.filter(a => a.id !== id);
      renderAll();
    }
  }
});

// CSV export
document.getElementById('export-csv').addEventListener('click', () => {
  const apps = getFilteredApps();
  const headers = ['Company', 'Role', 'Platform', 'Applied Date', 'Status', 'URL', 'Notes'];
  const rows = apps.map(a => [
    a.company, a.role, a.platform,
    new Date(a.appliedAt).toLocaleDateString(),
    a.status, a.url, a.notes || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`));

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `job-applications-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Cover Letter Modal ────────────────────────────────────────────────────────

let clCurrentApp = null;
let clVersions   = [];
let clSelectedId = null;

function openCoverLetterModal(app) {
  clCurrentApp = app;
  clVersions   = [];
  clSelectedId = null;

  document.getElementById('cl-job-info').textContent = `${app.role} at ${app.company}`;
  document.getElementById('cl-placeholder').style.display = 'flex';
  document.getElementById('cl-placeholder').textContent = 'Select a version or generate a new cover letter.';
  document.getElementById('cl-output').style.display = 'none';
  document.getElementById('cl-output').value = '';
  document.getElementById('cl-copy-btn').style.display = 'none';
  document.getElementById('cl-download-pdf').style.display = 'none';
  document.getElementById('cl-star-btn').style.display = 'none';
  document.getElementById('cl-del-btn').style.display = 'none';
  document.getElementById('cl-add-to-lib-btn').style.display = 'none';
  document.getElementById('cl-gen-loading').style.display = 'none';
  document.getElementById('cl-generate-btn').disabled = false;

  // Resume status
  chrome.runtime.sendMessage({ type: 'GET_RESUME_VERSIONS' }, result => {
    const statusEl = document.getElementById('cl-resume-status');
    const versions = result?.versions || [];
    const fav = versions.find(v => v.isFavorite) || versions[0];
    if (fav) {
      statusEl.textContent = `Resume: ${fav.filename || 'uploaded'}`;
      statusEl.className = 'cl-resume-status has-resume';
    } else {
      statusEl.textContent = 'No resume on file — go to Settings to upload one.';
      statusEl.className = 'cl-resume-status no-resume';
      document.getElementById('cl-generate-btn').disabled = true;
    }
  });

  // Load saved cover letter versions
  chrome.runtime.sendMessage({ type: 'GET_COVER_LETTERS', appId: app.id }, result => {
    clVersions = result?.coverLetters || [];
    renderCLVersions();
  });

  document.getElementById('cl-modal-overlay').style.display = 'flex';
}

function closeCoverLetterModal() {
  document.getElementById('cl-modal-overlay').style.display = 'none';
  clCurrentApp = null;
  clVersions   = [];
  clSelectedId = null;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderCLVersions() {
  const container = document.getElementById('cl-versions');

  if (!clVersions.length) {
    container.innerHTML = '<div class="cl-no-versions">No versions yet. Generate one above.</div>';
    return;
  }

  container.innerHTML = clVersions.map(v => `
    <div class="cl-version-item ${v.id === clSelectedId ? 'active' : ''}" data-id="${v.id}">
      <div class="cl-version-info">
        <div class="cl-version-date">${formatDateTime(v.createdAt)}</div>
        <div class="cl-version-preview">${esc(v.text.slice(0, 55))}…</div>
      </div>
      <button class="cl-version-star ${v.isFavorite ? 'starred' : ''}"
        data-id="${v.id}" title="${v.isFavorite ? 'Favorited' : 'Set as favorite'}">
        ${v.isFavorite ? 'Saved' : 'Save'}
      </button>
    </div>
  `).join('');
}

function selectCLVersion(versionId) {
  clSelectedId = versionId;
  const version = clVersions.find(v => v.id === versionId);
  if (!version) return;

  document.getElementById('cl-placeholder').style.display = 'none';
  document.getElementById('cl-output').value = version.text;
  document.getElementById('cl-output').style.display = 'block';
  document.getElementById('cl-copy-btn').style.display = 'inline-flex';
  document.getElementById('cl-download-pdf').style.display = 'inline-flex';

  const starBtn = document.getElementById('cl-star-btn');
  starBtn.style.display = 'inline-flex';
  starBtn.textContent   = version.isFavorite ? 'Saved' : 'Save';
  starBtn.title         = version.isFavorite ? 'Favorited' : 'Set as favorite';

  document.getElementById('cl-del-btn').style.display = 'inline-flex';
  document.getElementById('cl-add-to-lib-btn').style.display = 'inline-flex';

  renderCLVersions();
}

// Events — modal close
document.getElementById('cl-modal-close').addEventListener('click', closeCoverLetterModal);
document.getElementById('cl-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCoverLetterModal();
});

// Generate new version
document.getElementById('cl-generate-btn').addEventListener('click', () => {
  if (!clCurrentApp) return;
  const genBtn = document.getElementById('cl-generate-btn');
  genBtn.disabled = true;
  document.getElementById('cl-gen-loading').style.display = 'flex';

  chrome.runtime.sendMessage(
    { type: 'GENERATE_COVER_LETTER', company: clCurrentApp.company, role: clCurrentApp.role, appId: clCurrentApp.id },
    response => {
      genBtn.disabled = false;
      document.getElementById('cl-gen-loading').style.display = 'none';

      if (response?.error) {
        const ph = document.getElementById('cl-placeholder');
        if (response.error === 'NO_API_KEY') {
          ph.textContent = 'No Groq API key set. Open Settings (⚙ in the sidebar) to add one.';
        } else if (response.error === 'NO_RESUME') {
          ph.textContent = 'No resume on file. Go to Settings to upload one.';
        } else {
          ph.textContent = `Error: ${response.error}`;
        }
        ph.style.display = 'flex';
        document.getElementById('cl-output').style.display = 'none';
        return;
      }

      // Reload versions from storage then select the newest
      chrome.runtime.sendMessage({ type: 'GET_COVER_LETTERS', appId: clCurrentApp.id }, result => {
        clVersions = result?.coverLetters || [];
        // Also update the in-memory app object
        const appIdx = allApplications.findIndex(a => a.id === clCurrentApp.id);
        if (appIdx !== -1) allApplications[appIdx].coverLetters = clVersions;
        renderCLVersions();
        if (clVersions.length) selectCLVersion(clVersions[0].id);
      });
    }
  );
});

// Version list — click to select, click star to favorite
document.getElementById('cl-versions').addEventListener('click', e => {
  const starBtn    = e.target.closest('.cl-version-star');
  const versionItem = e.target.closest('.cl-version-item');

  if (starBtn) {
    e.stopPropagation();
    const id = starBtn.dataset.id;
    chrome.runtime.sendMessage({ type: 'SET_FAVORITE_CL', appId: clCurrentApp.id, versionId: id }, () => {
      clVersions.forEach(v => { v.isFavorite = v.id === id; });
      if (clSelectedId === id) {
        document.getElementById('cl-star-btn').textContent = 'Saved';
      }
      renderCLVersions();
    });
    return;
  }

  if (versionItem) selectCLVersion(versionItem.dataset.id);
});

// Star button in right panel
document.getElementById('cl-star-btn').addEventListener('click', () => {
  if (!clSelectedId || !clCurrentApp) return;
  chrome.runtime.sendMessage({ type: 'SET_FAVORITE_CL', appId: clCurrentApp.id, versionId: clSelectedId }, () => {
    clVersions.forEach(v => { v.isFavorite = v.id === clSelectedId; });
    document.getElementById('cl-star-btn').textContent = 'Saved';
    document.getElementById('cl-star-btn').title = 'Favorited';
    renderCLVersions();
  });
});

// Delete button in right panel
document.getElementById('cl-del-btn').addEventListener('click', () => {
  if (!clSelectedId || !clCurrentApp) return;
  if (!confirm('Delete this cover letter version?')) return;

  chrome.runtime.sendMessage({ type: 'DELETE_COVER_LETTER', appId: clCurrentApp.id, versionId: clSelectedId }, () => {
    clVersions = clVersions.filter(v => v.id !== clSelectedId);
    const appIdx = allApplications.findIndex(a => a.id === clCurrentApp.id);
    if (appIdx !== -1) allApplications[appIdx].coverLetters = clVersions;
    clSelectedId = null;
    document.getElementById('cl-output').style.display = 'none';
    document.getElementById('cl-copy-btn').style.display = 'none';
    document.getElementById('cl-download-pdf').style.display = 'none';
    document.getElementById('cl-star-btn').style.display = 'none';
    document.getElementById('cl-del-btn').style.display = 'none';
    document.getElementById('cl-add-to-lib-btn').style.display = 'none';
    document.getElementById('cl-placeholder').style.display = 'flex';
    renderCLVersions();
  });
});

// Copy button
document.getElementById('cl-copy-btn').addEventListener('click', () => {
  const text = document.getElementById('cl-output').value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('cl-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// Download PDF — per-app modal
document.getElementById('cl-download-pdf').addEventListener('click', () => {
  const text = document.getElementById('cl-output').value;
  const title = clCurrentApp ? `Cover Letter – ${clCurrentApp.role} at ${clCurrentApp.company}` : 'Cover Letter';
  downloadCLAsPdf(text, title);
});

// Add to library from per-app CL modal
document.getElementById('cl-add-to-lib-btn').addEventListener('click', () => {
  const text = document.getElementById('cl-output').value;
  if (!text || !clCurrentApp) return;
  const title = `${clCurrentApp.role} at ${clCurrentApp.company}`;
  chrome.runtime.sendMessage({ type: 'SAVE_CL_TO_LIBRARY', title, text }, () => {
    const btn = document.getElementById('cl-add-to-lib-btn');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save to Library'; }, 2000);
  });
});

// Wire up cover letter buttons via table delegation
document.getElementById('table-body').addEventListener('click', e => {
  const clBtn = e.target.closest('.cover-letter-btn');
  if (clBtn) {
    const app = allApplications.find(a => a.id === clBtn.dataset.id);
    if (app) openCoverLetterModal(app);
  }
});

// Settings button
document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
});

// ── Download cover letter as PDF ──────────────────────────────────────────────

function downloadCLAsPdf(text, title) {
  if (!text) return;
  const filename = (title || 'cover-letter').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') + '.pdf';
  const bytes = buildMinimalPdf(title || 'Cover Letter', text);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function buildMinimalPdf(title, body) {
  const PW = 612, PH = 792, ML = 72, MT = 72, MB = 72;
  const titleSz = 14, bodySz = 11, titleLH = 28, bodyLH = 18;

  function sanitize(s) {
    return s
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013/g, '-').replace(/\u2014/g, '--').replace(/\u2026/g, '...')
      .replace(/[^\x20-\x7E\n]/g, '');
  }

  function esc(s) {
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function wordWrap(text, maxChars) {
    const result = [];
    for (const para of text.split('\n')) {
      if (!para.trim()) { result.push(''); continue; }
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (candidate.length > maxChars && line) { result.push(line); line = word; }
        else line = candidate;
      }
      if (line) result.push(line);
    }
    return result;
  }

  const cleanTitle = sanitize(title);
  const cleanBody  = sanitize(body);

  // Build content stream
  const sl = ['BT'];
  let y = PH - MT;

  sl.push(`/F2 ${titleSz} Tf`);
  sl.push(`1 0 0 1 ${ML} ${y} Tm`);
  sl.push(`(${esc(cleanTitle)}) Tj`);
  y -= titleLH;

  sl.push(`/F1 ${bodySz} Tf`);
  for (const line of wordWrap(cleanBody, 78)) {
    if (y < MB) break;
    sl.push(`1 0 0 1 ${ML} ${y} Tm`);
    sl.push(`(${esc(line)}) Tj`);
    y -= bodyLH;
  }
  sl.push('ET');
  const stream = sl.join('\n') + '\n';
  const streamLen = stream.length; // all ASCII after sanitize

  // Object bodies
  const O = {};
  O[1] = '<</Type /Catalog /Pages 2 0 R>>';
  O[2] = '<</Type /Pages /Kids [3 0 R] /Count 1>>';
  O[3] = `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents 4 0 R /Resources <</Font <</F1 5 0 R /F2 6 0 R>>>>>>`;
  O[4] = `<</Length ${streamLen}>>\nstream\n${stream}endstream`;
  O[5] = '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>';
  O[6] = '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>';

  let pdf = '%PDF-1.4\n';
  const offsets = {};
  for (let i = 1; i <= 6; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${O[i]}\nendobj\n`;
  }

  const xrefPos = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) {
    pdf += offsets[i].toString().padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<</Size 7 /Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  allApplications = await loadApplications();
  renderAll();

  // Auto-open add modal if navigated from popup with ?action=add
  if (new URLSearchParams(window.location.search).get('action') === 'add') {
    openModal();
  }
}

init();

// ── View switching ────────────────────────────────────────────────────────────

let currentView = 'applications'; // 'applications' | 'resumes' | 'coverletters'

function switchView(view) {
  currentView = view;

  // Nav highlight
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (view === 'applications') {
    document.querySelector(`.nav-item[data-filter="${currentFilter}"]`)?.classList.add('active');
  } else {
    document.querySelector(`.nav-view-btn[data-view="${view}"]`)?.classList.add('active');
  }

  // Show/hide main content areas
  const isApp = view === 'applications';
  document.getElementById('stats-bar').style.display     = isApp ? 'flex' : 'none';
  document.getElementById('table-wrap').style.display    = isApp ? 'block' : 'none';
  document.querySelector('.toolbar').style.display       = isApp ? 'flex' : 'none';
  document.getElementById('view-resumes').style.display      = view === 'resumes' ? 'flex' : 'none';
  document.getElementById('view-coverletters').style.display = view === 'coverletters' ? 'flex' : 'none';

  if (view === 'resumes')      loadResumesView();
  if (view === 'coverletters') loadCLLibraryView();
}

document.querySelectorAll('.nav-view-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (currentView !== 'applications') switchView('applications');
  });
});

// ── Resume view ───────────────────────────────────────────────────────────────

let rvVersions = [];
let rvSelectedId = null;

function loadResumesView() {
  chrome.runtime.sendMessage({ type: 'GET_RESUME_VERSIONS' }, result => {
    rvVersions = result?.versions || [];
    renderRVList();
    if (rvVersions.length) selectRVVersion(rvVersions.find(v => v.isFavorite)?.id || rvVersions[0].id);
  });
}

function renderRVList() {
  const list = document.getElementById('rv-list-panel');
  if (!rvVersions.length) {
    list.innerHTML = '<div class="panel-empty">No resumes uploaded yet.</div>';
    return;
  }
  list.innerHTML = rvVersions.map(v => `
    <div class="rv-item-panel ${v.id === rvSelectedId ? 'rv-selected' : ''}" data-id="${v.id}">
      <div class="rv-info-panel">
        <div class="rv-name-panel">${esc(v.filename)}</div>
        <div class="rv-date-panel">${new Date(v.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}${!v.analysis ? ' · <span class="rv-unanalyzed-tag">not analyzed</span>' : ''}</div>
      </div>
      <div class="rv-actions-panel">
        <button class="rv-fav-btn ${v.isFavorite ? 'rv-fav-active' : ''}" data-id="${v.id}" title="${v.isFavorite ? 'Favorited' : 'Set as favorite'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${v.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="rv-del-btn" data-id="${v.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

let _rvBlobUrl = null;

function selectRVVersion(id) {
  rvSelectedId = id;
  const v = rvVersions.find(v => v.id === id);
  renderRVList();
  if (!v) return;

  // Clean up previous blob URL
  if (_rvBlobUrl) { URL.revokeObjectURL(_rvBlobUrl); _rvBlobUrl = null; }

  const panel = document.getElementById('rv-analysis-panel');
  const placeholder = document.getElementById('rv-placeholder');
  const content = document.getElementById('rv-analysis-content');
  const isPdf = v.filename?.toLowerCase().endsWith('.pdf');
  const hasPdfData = isPdf && v._raw?.pdf;

  placeholder.style.display = 'none';

  if (hasPdfData) {
    content.style.cssText = 'flex: 1; display: flex; flex-direction: column; min-height: 0;';
    // Build blob URL
    const binary = atob(v._raw.pdf);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    _rvBlobUrl = URL.createObjectURL(blob);

    panel.classList.add('pdf-mode');
    content.className = 'rv-pdf-layout';
    content.innerHTML = `
      <div class="rv-pdf-toolbar">
        <span class="rv-pdf-filename">${esc(v.filename)}</span>
        <div class="rv-pdf-toolbar-actions">
          ${!v.analysis
            ? `<button class="btn-rv-analyze" id="rv-analyze-btn">Analyze</button>`
            : `<span class="rv-pdf-analyzed-badge">Analyzed</span>`}
        </div>
      </div>
      <iframe class="rv-pdf-frame" src="${_rvBlobUrl}"></iframe>
    `;
    document.getElementById('rv-analyze-btn')?.addEventListener('click', () => analyzeRVVersion(v.id));
    return;
  }

  // Non-PDF or PDF without raw data
  panel.classList.remove('pdf-mode');
  content.className = '';
  content.style.cssText = 'display: block;';

  if (!v.analysis) {
    content.innerHTML = `
      <div class="rv-no-analysis">
        <div class="rv-no-analysis-filename">${esc(v.filename)}</div>
        <p class="rv-no-analysis-hint">Resume uploaded. Run AI analysis to extract skills, experience, and strengths — used for cover letter generation.</p>
        <div class="rv-no-analysis-actions">
          <button class="btn-rv-analyze" id="rv-analyze-btn" data-id="${v.id}">Analyze Resume</button>
        </div>
      </div>
    `;
    document.getElementById('rv-analyze-btn').addEventListener('click', () => analyzeRVVersion(v.id));
    return;
  }

  const a = v.analysis;
  content.innerHTML = `
    <div class="rv-analysis-header">
      <div>
        <div class="rv-analysis-name">${esc(a.name || 'Resume')}</div>
        <div class="rv-analysis-meta">${esc(v.filename)} · ${v.isFavorite ? 'Favorite' : 'Not favorite'}</div>
      </div>
    </div>
    ${a.summary ? `<div class="rv-analysis-summary">${esc(a.summary)}</div>` : ''}
    ${(a.skills||[]).length ? `
      <div class="rv-section-title">Skills</div>
      <div class="rv-badge-row">${(a.skills||[]).map(s=>`<span class="rv-badge rv-badge-skill">${esc(s)}</span>`).join('')}</div>
    ` : ''}
    ${(a.strengths||[]).length ? `
      <div class="rv-section-title">Strengths</div>
      <div class="rv-badge-row">${(a.strengths||[]).map(s=>`<span class="rv-badge rv-badge-strength">${esc(s)}</span>`).join('')}</div>
    ` : ''}
    ${(a.experience||[]).length ? `
      <div class="rv-section-title">Experience</div>
      ${(a.experience||[]).map(e=>`
        <div class="rv-exp-item">
          <div class="rv-exp-role">${esc(e.role)} <span class="rv-exp-company">at ${esc(e.company)}</span></div>
          ${(e.highlights||[]).map(h=>`<div class="rv-exp-highlight">• ${esc(h)}</div>`).join('')}
        </div>
      `).join('')}
    ` : ''}
  `;
}


function analyzeRVVersion(id) {
  const v = rvVersions.find(v => v.id === id);
  if (!v?._raw) { showRVStatus('error', 'Raw file data not available. Please re-upload.'); return; }

  const content = document.getElementById('rv-analysis-content');
  content.innerHTML = `<div class="rv-no-analysis"><div class="rv-spinner" style="display:block;margin:0 auto 12px"></div><p class="rv-no-analysis-hint">Analyzing\u2026</p></div>`;

  chrome.runtime.sendMessage({ type: 'ANALYZE_RESUME', pdf: v._raw.pdf, text: v._raw.text }, response => {
    if (response?.error) {
      const msg = response.error === 'CF_NOT_CONFIGURED'
        ? 'Cloudflare Worker not configured. Add the Worker URL and token in Settings.'
        : `Analysis failed: ${response.error}`;
      showRVStatus('error', msg); selectRVVersion(id); return;
    }
    const idx = rvVersions.findIndex(v => v.id === id);
    if (idx !== -1) {
      rvVersions[idx].analysis = response.result;
    }
    chrome.storage.local.set({ resumeVersions: rvVersions }, () => {
      showRVStatus('success', 'Analysis complete');
      selectRVVersion(id);
    });
  });
}

// Resume list events
document.getElementById('rv-list-panel').addEventListener('click', e => {
  const favBtn = e.target.closest('.rv-fav-btn');
  const delBtn = e.target.closest('.rv-del-btn');
  const item   = e.target.closest('.rv-item-panel');

  if (favBtn) {
    e.stopPropagation();
    const id = favBtn.dataset.id;
    chrome.runtime.sendMessage({ type: 'SET_FAVORITE_RESUME', versionId: id }, () => {
      rvVersions.forEach(v => { v.isFavorite = v.id === id; });
      renderRVList();
      selectRVVersion(id);
    });
    return;
  }

  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    if (!confirm('Delete this resume version?')) return;
    chrome.runtime.sendMessage({ type: 'DELETE_RESUME_VERSION', versionId: id }, () => {
      rvVersions = rvVersions.filter(v => v.id !== id);
      if (rvVersions.length && rvVersions[0]) {
        rvVersions[0].isFavorite = rvVersions[0].isFavorite || (rvSelectedId === id);
      }
      rvSelectedId = null;
      document.getElementById('rv-placeholder').style.display = 'flex';
      document.getElementById('rv-analysis-content').style.display = 'none';
      renderRVList();
      if (rvVersions.length) selectRVVersion(rvVersions.find(v=>v.isFavorite)?.id || rvVersions[0].id);
    });
    return;
  }

  if (item) selectRVVersion(item.dataset.id);
});

// Resume upload
document.getElementById('rv-add-btn').addEventListener('click', () => {
  const zone = document.getElementById('rv-upload-zone');
  zone.style.display = zone.style.display === 'none' ? 'block' : 'none';
});

const rvFileInput = document.getElementById('rv-file-input');
const rvUploadZone = document.getElementById('rv-upload-zone');

rvUploadZone.addEventListener('dragover', e => { e.preventDefault(); rvUploadZone.classList.add('drag-over'); });
rvUploadZone.addEventListener('dragleave', () => rvUploadZone.classList.remove('drag-over'));
rvUploadZone.addEventListener('drop', e => { e.preventDefault(); rvUploadZone.classList.remove('drag-over'); if (e.dataTransfer?.files?.[0]) handleRVFile(e.dataTransfer.files[0]); });
rvFileInput.addEventListener('change', () => { if (rvFileInput.files?.[0]) handleRVFile(rvFileInput.files[0]); });

function showRVStatus(type, msg) {
  const el = document.getElementById('rv-status');
  const spinner = document.getElementById('rv-spinner');
  const msgEl = document.getElementById('rv-status-msg');
  el.style.display = 'flex';
  el.className = `rv-status rv-status-${type}`;
  spinner.style.display = type === 'loading' ? 'block' : 'none';
  msgEl.textContent = msg;
}

async function handleRVFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf','docx','txt'].includes(ext)) { showRVStatus('error','Unsupported file. Use PDF, DOCX, or TXT.'); return; }
  showRVStatus('loading', 'Reading file\u2026');
  document.getElementById('rv-upload-zone').style.display = 'none';

  try {
    let pdf = null, text = null;
    if (ext === 'pdf') {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      pdf = btoa(bin);
    } else if (ext === 'docx') {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      text = result.value.trim();
    } else {
      text = await new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); });
      text = text.trim();
    }

    const newVersion = {
      id: crypto.randomUUID(),
      analysis: null,
      filename: file.name,
      createdAt: new Date().toISOString(),
      isFavorite: rvVersions.length === 0,
      _raw: { pdf, text }
    };
    rvVersions.unshift(newVersion);
    chrome.storage.local.set({ resumeVersions: rvVersions }, () => {
      showRVStatus('success', `Uploaded: ${file.name}`);
      renderRVList();
      selectRVVersion(newVersion.id);
    });
  } catch(err) { showRVStatus('error', `Failed: ${err.message}`); }
}

// ── Cover Letter Library view ─────────────────────────────────────────────────

let cllEntries = [];
let cllSelectedId = null;

function loadCLLibraryView() {
  chrome.runtime.sendMessage({ type: 'GET_CL_LIBRARY' }, result => {
    cllEntries = result?.entries || [];
    renderCLLList();
    if (cllEntries.length) selectCLLEntry(cllEntries.find(e => e.isFavorite)?.id || cllEntries[0].id);
  });
}

function renderCLLList() {
  const list = document.getElementById('cll-list');
  if (!cllEntries.length) {
    list.innerHTML = '<div class="panel-empty">No cover letters saved yet.</div>';
    return;
  }
  list.innerHTML = cllEntries.map(e => `
    <div class="cll-item ${e.id === cllSelectedId ? 'cll-item-active' : ''}" data-id="${e.id}">
      <div class="cll-item-info">
        <div class="cll-item-title">${esc(e.title)}</div>
        <div class="cll-item-date">${new Date(e.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
      </div>
      <div class="cll-item-actions">
        <button class="cll-list-fav-btn ${e.isFavorite ? 'cll-list-fav-active' : ''}" data-id="${e.id}" title="${e.isFavorite ? 'Favorited' : 'Set as favorite'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${e.isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="cll-list-del-btn" data-id="${e.id}" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function selectCLLEntry(id) {
  cllSelectedId = id;
  const entry = cllEntries.find(e => e.id === id);
  renderCLLList();
  if (!entry) return;

  document.getElementById('cll-placeholder').style.display = 'none';
  document.getElementById('cll-editor').style.display = 'flex';
  document.getElementById('cll-title-input').value = entry.title || '';
  document.getElementById('cll-text-input').value  = entry.text  || '';
  document.getElementById('cll-fav-btn').textContent = entry.isFavorite ? 'Favorited' : 'Set as Favorite';
}

document.getElementById('cll-list').addEventListener('click', e => {
  const favBtn = e.target.closest('.cll-list-fav-btn');
  const delBtn = e.target.closest('.cll-list-del-btn');
  const item   = e.target.closest('.cll-item');

  if (favBtn) {
    e.stopPropagation();
    const id = favBtn.dataset.id;
    chrome.runtime.sendMessage({ type: 'SET_FAVORITE_CL_LIBRARY', id }, () => {
      cllEntries.forEach(e => { e.isFavorite = e.id === id; });
      if (cllSelectedId === id) document.getElementById('cll-fav-btn').textContent = 'Favorited';
      renderCLLList();
    });
    return;
  }

  if (delBtn) {
    e.stopPropagation();
    const id = delBtn.dataset.id;
    if (!confirm('Delete this cover letter?')) return;
    chrome.runtime.sendMessage({ type: 'DELETE_CL_FROM_LIBRARY', id }, () => {
      cllEntries = cllEntries.filter(e => e.id !== id);
      if (cllSelectedId === id) {
        cllSelectedId = null;
        document.getElementById('cll-editor').style.display = 'none';
        document.getElementById('cll-placeholder').style.display = 'flex';
      }
      renderCLLList();
    });
    return;
  }

  if (item) selectCLLEntry(item.dataset.id);
});

document.getElementById('cll-add-btn').addEventListener('click', () => {
  cllSelectedId = null;
  renderCLLList();
  document.getElementById('cll-placeholder').style.display = 'none';
  document.getElementById('cll-editor').style.display = 'flex';
  document.getElementById('cll-title-input').value = '';
  document.getElementById('cll-text-input').value  = '';
  document.getElementById('cll-fav-btn').textContent = 'Set as Favorite';
  document.getElementById('cll-title-input').focus();
});

document.getElementById('cll-save-btn').addEventListener('click', () => {
  const title = document.getElementById('cll-title-input').value.trim() || 'Cover Letter';
  const text  = document.getElementById('cll-text-input').value.trim();
  if (!text) return;

  if (cllSelectedId) {
    chrome.runtime.sendMessage({ type: 'UPDATE_CL_IN_LIBRARY', id: cllSelectedId, updates: { title, text } }, () => {
      const idx = cllEntries.findIndex(e => e.id === cllSelectedId);
      if (idx !== -1) { cllEntries[idx].title = title; cllEntries[idx].text = text; }
      renderCLLList();
    });
  } else {
    chrome.runtime.sendMessage({ type: 'SAVE_CL_TO_LIBRARY', title, text }, result => {
      if (result?.entry) {
        cllEntries.unshift(result.entry);
        cllSelectedId = result.entry.id;
        renderCLLList();
        document.getElementById('cll-fav-btn').textContent = result.entry.isFavorite ? 'Favorited' : 'Set as Favorite';
      }
    });
  }
});

document.getElementById('cll-fav-btn').addEventListener('click', () => {
  if (!cllSelectedId) return;
  chrome.runtime.sendMessage({ type: 'SET_FAVORITE_CL_LIBRARY', id: cllSelectedId }, () => {
    cllEntries.forEach(e => { e.isFavorite = e.id === cllSelectedId; });
    document.getElementById('cll-fav-btn').textContent = 'Favorited';
    renderCLLList();
  });
});

document.getElementById('cll-copy-btn').addEventListener('click', () => {
  const text = document.getElementById('cll-text-input').value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('cll-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

document.getElementById('cll-download-pdf').addEventListener('click', () => {
  const text  = document.getElementById('cll-text-input').value;
  const title = document.getElementById('cll-title-input').value.trim() || 'Cover Letter';
  downloadCLAsPdf(text, title);
});

document.getElementById('cll-del-btn').addEventListener('click', () => {
  if (!cllSelectedId || !confirm('Delete this cover letter?')) return;
  chrome.runtime.sendMessage({ type: 'DELETE_CL_FROM_LIBRARY', id: cllSelectedId }, () => {
    cllEntries = cllEntries.filter(e => e.id !== cllSelectedId);
    cllSelectedId = null;
    renderCLLList();
    document.getElementById('cll-editor').style.display = 'none';
    document.getElementById('cll-placeholder').style.display = 'flex';
  });
});
