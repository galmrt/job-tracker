// Background service worker
// Handles messages from content scripts and manages storage

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'JOB_APPLIED') {
    handleJobApplied(message.data, sender.tab);
    sendResponse({ success: true });
  }
  if (message.type === 'GET_APPLICATIONS') {
    getApplications().then(apps => sendResponse({ applications: apps }));
    return true;
  }
  if (message.type === 'UPDATE_APPLICATION') {
    updateApplication(message.id, message.updates).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'DELETE_APPLICATION') {
    deleteApplication(message.id).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === 'ADD_APPLICATION') {
    saveApplication(message.data).then(app => sendResponse({ application: app }));
    return true;
  }
  if (message.type === 'ANALYZE_JD') {
    analyzeJD(message.text).then(sendResponse);
    return true;
  }
  if (message.type === 'GENERATE_COVER_LETTER') {
    generateCoverLetter(message.company, message.role, message.resume).then(sendResponse);
    return true;
  }
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
  }
});

// ── Job application handlers ──────────────────────────────────────────────────

async function handleJobApplied(data, tab) {
  const app = await saveApplication(data);

  chrome.notifications.create(`job-applied-${app.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
    title: 'Application Tracked!',
    message: `${app.role} at ${app.company}`
  });
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
    status: 'applied',
    notes: ''
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

// ── GENERATE_COVER_LETTER ─────────────────────────────────────────────────────

async function generateCoverLetter(company, role, resume) {
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
${resume}

Write 3 focused paragraphs:
1. Why you want this specific role at this specific company
2. Your most relevant experience and concrete accomplishments
3. Brief closing with a call to action`
    }
  ]);

  if (error) return { error };
  return { letter: content };
}
