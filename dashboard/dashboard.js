// Dashboard script

const STATUS_OPTIONS = {
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
        <button class="icon-btn cover-letter-btn" data-id="${app.id}" title="Generate Cover Letter">✦</button>
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

function openCoverLetterModal(app) {
  clCurrentApp = app;

  document.getElementById('cl-job-info').textContent = `${app.role} at ${app.company}`;
  document.getElementById('cl-placeholder').style.display = 'block';
  document.getElementById('cl-output').style.display = 'none';
  document.getElementById('cl-output').value = '';
  document.getElementById('cl-copy-btn').style.display = 'none';
  document.getElementById('cl-loading').style.display = 'none';
  document.getElementById('cl-generate-btn').disabled = false;

  // Pre-load saved resume snippet
  chrome.storage.local.get('resumeSnippet', result => {
    document.getElementById('cl-resume').value = result.resumeSnippet || '';
  });

  document.getElementById('cl-modal-overlay').style.display = 'flex';
}

function closeCoverLetterModal() {
  document.getElementById('cl-modal-overlay').style.display = 'none';
  clCurrentApp = null;
}

document.getElementById('cl-modal-close').addEventListener('click', closeCoverLetterModal);
document.getElementById('cl-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCoverLetterModal();
});

document.getElementById('cl-generate-btn').addEventListener('click', async () => {
  if (!clCurrentApp) return;

  const resume = document.getElementById('cl-resume').value.trim();
  if (!resume) {
    document.getElementById('cl-resume').focus();
    return;
  }

  // Save resume for next time
  chrome.storage.local.set({ resumeSnippet: resume });

  document.getElementById('cl-generate-btn').disabled = true;
  document.getElementById('cl-placeholder').style.display = 'none';
  document.getElementById('cl-output').style.display = 'none';
  document.getElementById('cl-copy-btn').style.display = 'none';
  document.getElementById('cl-loading').style.display = 'flex';

  chrome.runtime.sendMessage(
    {
      type: 'GENERATE_COVER_LETTER',
      company: clCurrentApp.company,
      role: clCurrentApp.role,
      resume
    },
    response => {
      document.getElementById('cl-loading').style.display = 'none';
      document.getElementById('cl-generate-btn').disabled = false;

      if (response.error) {
        if (response.error === 'NO_API_KEY') {
          document.getElementById('cl-placeholder').textContent =
            'No Groq API key set. Open Settings (⚙ in the sidebar) to add one.';
          document.getElementById('cl-placeholder').style.display = 'block';
        } else {
          document.getElementById('cl-placeholder').textContent = `Error: ${response.error}`;
          document.getElementById('cl-placeholder').style.display = 'block';
        }
        return;
      }

      const output = document.getElementById('cl-output');
      output.value = response.letter;
      output.style.display = 'block';
      document.getElementById('cl-copy-btn').style.display = 'inline-flex';
    }
  );
});

document.getElementById('cl-copy-btn').addEventListener('click', () => {
  const text = document.getElementById('cl-output').value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('cl-copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// Wire up cover letter buttons via table delegation (added in renderTable)
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
