// Popup script

const STATUS_LABELS = {
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
};

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderJobs(applications) {
  const list = document.getElementById('job-list');
  const recent = applications.slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>No applications tracked yet.<br/>Apply to jobs to get started.</p>
      </div>`;
    return;
  }

  list.innerHTML = recent.map(app => `
    <div class="job-item" data-status="${app.status}">
      <div class="job-role">${escapeHtml(app.role)}</div>
      <div class="job-meta">
        <span class="job-company">${escapeHtml(app.company)}</span>
        <span class="job-date">${formatDate(app.appliedAt)}</span>
      </div>
      <span class="platform-badge">${app.platform}</span>
    </div>
  `).join('');
}

function renderStats(applications) {
  const active = applications.filter(a =>
    ['applied', 'phone_screen', 'interview'].includes(a.status)
  ).length;
  const offers = applications.filter(a => a.status === 'offer').length;

  document.getElementById('total').textContent = applications.length;
  document.getElementById('active').textContent = active;
  document.getElementById('offers').textContent = offers;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
}

function openAddModal() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') + '?action=add' });
  window.close();
}

// Init
chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS' }, response => {
  const apps = response?.applications || [];
  renderStats(apps);
  renderJobs(apps);
});

document.getElementById('open-dashboard').addEventListener('click', openDashboard);
document.getElementById('add-manual').addEventListener('click', openAddModal);
