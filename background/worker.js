// Background service worker
// Handles messages from content scripts and manages storage

// ── Cloudflare Worker config ──────────────────────────────────────────────────
// After deploying cloudflare/worker.js, replace these values:
const CF_WORKER_URL = 'https://job-tracker-analyzer.marat-gal.workers.dev';
const CF_TOKEN = 'a24c8610ec7b2bd979e4cae1a0134db86c539501389fcbd0348fbc8bfb111413'; // must match EXTENSION_TOKEN secret in CF

// ── Cover Letter Library ──────────────────────────────────────────────────────

async function getCLLibrary() {
  const r = await chrome.storage.local.get('clLibrary');
  return r.clLibrary || [];
}

async function saveCLToLibrary(title, text) {
  const lib = await getCLLibrary();
  const entry = { id: crypto.randomUUID(), title: title || 'Cover Letter', text, createdAt: new Date().toISOString(), isFavorite: lib.length === 0 };
  lib.unshift(entry);
  await chrome.storage.local.set({ clLibrary: lib });
  return entry;
}

async function updateCLInLibrary(id, updates) {
  const lib = await getCLLibrary();
  const idx = lib.findIndex(e => e.id === id);
  if (idx !== -1) { lib[idx] = { ...lib[idx], ...updates }; await chrome.storage.local.set({ clLibrary: lib }); }
}

async function deleteCLFromLibrary(id) {
  let lib = await getCLLibrary();
  const wasF = lib.find(e => e.id === id)?.isFavorite;
  lib = lib.filter(e => e.id !== id);
  if (wasF && lib.length) lib[0].isFavorite = true;
  await chrome.storage.local.set({ clLibrary: lib });
}

async function setFavoriteCLLibrary(id) {
  const lib = await getCLLibrary();
  lib.forEach(e => { e.isFavorite = e.id === id; });
  await chrome.storage.local.set({ clLibrary: lib });
}

chrome.commands.onCommand.addListener(command => {
  if (command === 'show-banner') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'FORCE_BANNER' }, () => void chrome.runtime.lastError);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_APPLIED') {
    handleJobApplied(message.data, sender.tab);
    sendResponse({ success: true });
  }
  const noop = () => void chrome.runtime.lastError;

  if (message.type === 'GET_APPLICATIONS') {
    getApplications().then(apps => sendResponse({ applications: apps })).catch(noop);
    return true;
  }
  if (message.type === 'UPDATE_APPLICATION') {
    updateApplication(message.id, message.data || message.updates).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'DELETE_APPLICATION') {
    deleteApplication(message.id).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'ADD_APPLICATION') {
    saveApplication(message.data).then(app => sendResponse({ application: app })).catch(noop);
    return true;
  }
  if (message.type === 'ANALYZE_JD') {
    analyzeJD(message.text).then(sendResponse).catch(noop);
    return true;
  }
  if (message.type === 'GENERATE_COVER_LETTER') {
    generateCoverLetter(message.company, message.role, message.appId || null).then(sendResponse).catch(noop);
    return true;
  }
  if (message.type === 'SAVE_COVER_LETTER') {
    saveCoverLetter(message.appId, message.text).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'GET_COVER_LETTERS') {
    getCoverLetters(message.appId).then(coverLetters => sendResponse({ coverLetters })).catch(noop);
    return true;
  }
  if (message.type === 'SET_FAVORITE_CL') {
    setFavoriteCL(message.appId, message.versionId).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'DELETE_COVER_LETTER') {
    deleteCoverLetter(message.appId, message.versionId).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'ANALYZE_RESUME') {
    analyzeResume(message.pdf, message.text).then(sendResponse).catch(noop);
    return true;
  }
  if (message.type === 'GET_RESUME_VERSIONS') {
    getResumeVersions().then(versions => sendResponse({ versions })).catch(noop);
    return true;
  }
  if (message.type === 'SET_FAVORITE_RESUME') {
    setFavoriteResume(message.versionId).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'DELETE_RESUME_VERSION') {
    deleteResumeVersion(message.versionId).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'GET_CL_LIBRARY') {
    getCLLibrary().then(entries => sendResponse({ entries })).catch(noop);
    return true;
  }
  if (message.type === 'SAVE_CL_TO_LIBRARY') {
    saveCLToLibrary(message.title, message.text).then(entry => sendResponse({ entry })).catch(noop);
    return true;
  }
  if (message.type === 'UPDATE_CL_IN_LIBRARY') {
    updateCLInLibrary(message.id, message.updates).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'DELETE_CL_FROM_LIBRARY') {
    deleteCLFromLibrary(message.id).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'SET_FAVORITE_CL_LIBRARY') {
    setFavoriteCLLibrary(message.id).then(() => sendResponse({ success: true })).catch(noop);
    return true;
  }
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') }, () => sendResponse({ success: true }));
    return true;
  }
});

// ── Job application handlers ──────────────────────────────────────────────────

async function handleJobApplied(data, tab) {
  await saveApplication(data);
}

async function saveApplication(data) {
  const applications = await getApplications();

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const duplicate = applications.find(
    a => a.url === data.url && new Date(a.appliedAt).getTime() > fiveMinutesAgo
  );
  if (duplicate) return duplicate;

  const app = {
    id: crypto.randomUUID(),
    company: data.company || extractCompanyFromUrl(data.url),
    role: data.role || 'Unknown Role',
    url: data.url,
    platform: data.platform || 'generic',
    appliedAt: new Date().toISOString(),
    status: data.status || 'applied',
    notes: '',
    coverLetters: []
  };

  applications.unshift(app);
  await chrome.storage.local.set({ applications });
  return app;
}

async function getApplications() {
  const result = await chrome.storage.local.get('applications');
  return result.applications || [];
}

async function updateApplication(id, updates) {
  const applications = await getApplications();
  const index = applications.findIndex(a => a.id === id);
  if (index !== -1) {
    applications[index] = { ...applications[index], ...updates };
    await chrome.storage.local.set({ applications });
  }
}

async function deleteApplication(id) {
  const applications = await getApplications();
  const filtered = applications.filter(a => a.id !== id);
  await chrome.storage.local.set({ applications: filtered });
}

function extractCompanyFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown Company';
  }
}

// ── Cover letter versioning ───────────────────────────────────────────────────

async function saveCoverLetter(appId, text) {
  const applications = await getApplications();
  const idx = applications.findIndex(a => a.id === appId);
  if (idx === -1) return null;

  const newVersion = {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString(),
    isFavorite: false
  };

  if (!Array.isArray(applications[idx].coverLetters)) {
    applications[idx].coverLetters = [];
  }
  applications[idx].coverLetters.unshift(newVersion);
  await chrome.storage.local.set({ applications });
  return newVersion;
}

async function getCoverLetters(appId) {
  const applications = await getApplications();
  const app = applications.find(a => a.id === appId);
  return app?.coverLetters || [];
}

async function setFavoriteCL(appId, versionId) {
  const applications = await getApplications();
  const idx = applications.findIndex(a => a.id === appId);
  if (idx === -1) return;
  (applications[idx].coverLetters || []).forEach(cl => {
    cl.isFavorite = cl.id === versionId;
  });
  await chrome.storage.local.set({ applications });
}

async function deleteCoverLetter(appId, versionId) {
  const applications = await getApplications();
  const idx = applications.findIndex(a => a.id === appId);
  if (idx === -1) return;
  applications[idx].coverLetters = (applications[idx].coverLetters || []).filter(
    cl => cl.id !== versionId
  );
  await chrome.storage.local.set({ applications });
}

// ── Resume versioning ─────────────────────────────────────────────────────────

async function getResumeVersions() {
  const result = await chrome.storage.local.get(['resumeVersions', 'resumeAnalysis', 'resumeFileName']);
  let versions = result.resumeVersions;

  // Migrate legacy single-resume storage
  if (!versions && result.resumeAnalysis) {
    versions = [{
      id: crypto.randomUUID(),
      analysis: result.resumeAnalysis,
      filename: result.resumeFileName || 'resume',
      createdAt: new Date().toISOString(),
      isFavorite: true
    }];
    await chrome.storage.local.set({ resumeVersions: versions });
    await chrome.storage.local.remove(['resumeAnalysis', 'resumeFileName']);
  }

  return versions || [];
}

async function setFavoriteResume(versionId) {
  const versions = await getResumeVersions();
  versions.forEach(v => { v.isFavorite = v.id === versionId; });
  await chrome.storage.local.set({ resumeVersions: versions });
}

async function deleteResumeVersion(versionId) {
  const versions = await getResumeVersions();
  const filtered = versions.filter(v => v.id !== versionId);
  // If the deleted version was the favorite, promote the first remaining
  if (filtered.length && !filtered.some(v => v.isFavorite)) {
    filtered[0].isFavorite = true;
  }
  await chrome.storage.local.set({ resumeVersions: filtered });
}

// ── Groq API helpers ──────────────────────────────────────────────────────────

async function getGroqSettings() {
  const result = await chrome.storage.local.get(['groqApiKey', 'groqModel']);
  return {
    apiKey: result.groqApiKey || '',
    model: result.groqModel || 'llama-3.3-70b-versatile'
  };
}

async function callGroq(messages, { json = false } = {}) {
  const { apiKey, model } = await getGroqSettings();

  if (!apiKey) return { error: 'NO_API_KEY' };

  const body = {
    model,
    messages,
    temperature: 0.4,
    max_tokens: 1024
  };

  if (json) body.response_format = { type: 'json_object' };

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err?.error?.message || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { content: data.choices[0].message.content };
  } catch (e) {
    return { error: e.message };
  }
}

// ── ANALYZE_JD ────────────────────────────────────────────────────────────────

async function analyzeJD(jdText) {
  const { error, content } = await callGroq([
    {
      role: 'system',
      content:
        'You are a job application assistant. Analyze job descriptions and return ONLY a JSON object with no markdown.'
    },
    {
      role: 'user',
      content:
        `Analyze the following job description and return a JSON object with these exact keys:
- "summary": string (2 sentences max describing the role)
- "seniority": one of "Internship", "Junior", "Mid", "Senior", "Lead", "Staff", "Principal", "Executive"
- "required_skills": string[] (up to 8 must-have skills or technologies)
- "nice_to_have": string[] (up to 5 bonus skills)
- "interview_topics": string[] (up to 5 likely interview focus areas)

Job description:
${jdText}`
    }
  ], { json: true });

  if (error) return { error };

  try {
    const result = JSON.parse(content);
    return { result };
  } catch {
    return { error: 'Failed to parse AI response. Please try again.' };
  }
}

// ── ANALYZE_RESUME ────────────────────────────────────────────────────────────

async function analyzeResume(pdf, text) {
  try {
    const res = await fetch(CF_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': CF_TOKEN
      },
      body: JSON.stringify({ pdf, text })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || `HTTP ${res.status}` };
    }

    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ── GENERATE_COVER_LETTER ─────────────────────────────────────────────────────

function formatResumeForLLM(analysis) {
  const lines = [];
  if (analysis.name)    lines.push(`Name: ${analysis.name}`);
  if (analysis.summary) lines.push(`Summary: ${analysis.summary}`);
  if (analysis.skills?.length)
    lines.push(`Skills: ${analysis.skills.join(', ')}`);
  if (analysis.experience?.length) {
    lines.push('Experience:');
    analysis.experience.forEach(e => {
      lines.push(`  - ${e.role} at ${e.company}`);
      (e.highlights || []).forEach(h => lines.push(`    • ${h}`));
    });
  }
  if (analysis.education?.length) {
    lines.push('Education:');
    analysis.education.forEach(e => lines.push(`  - ${e.degree}, ${e.institution}`));
  }
  if (analysis.strengths?.length)
    lines.push(`Strengths: ${analysis.strengths.join(', ')}`);
  return lines.join('\n');
}

async function generateCoverLetter(company, role, appId) {
  // Look up the favorite resume internally
  const versions = await getResumeVersions();
  if (!versions.length) return { error: 'NO_RESUME' };

  const fav      = versions.find(v => v.isFavorite) || versions[0];
  const resumeText = formatResumeForLLM(fav.analysis);

  const { error, content } = await callGroq([
    {
      role: 'system',
      content:
        'You are a professional cover letter writer. Write concise, compelling, and specific cover letters. Avoid clichés and generic filler phrases. Do not include a date, address block, or subject line — just the letter body starting with "Dear Hiring Manager,".'
    },
    {
      role: 'user',
      content:
        `Write a cover letter for this job application.

Company: ${company}
Role: ${role}

Candidate background:
${resumeText}

Write 3 focused paragraphs:
1. Why you want this specific role at this specific company
2. Your most relevant experience and concrete accomplishments
3. Brief closing with a call to action`
    }
  ]);

  if (error) return { error };

  // Auto-save to application if appId provided
  if (appId) {
    await saveCoverLetter(appId, content);
  }

  return { letter: content };
}
