// Cloudflare Worker — Resume Analyzer Proxy
//
// Deploy:
//   1. Install Wrangler: npm install -g wrangler
//   2. wrangler login
//   3. wrangler deploy cloudflare/worker.js --name job-tracker-analyzer --compatibility-date 2024-01-01
//
// Set secrets (run once after deploy):
//   wrangler secret put GEMINI_API_KEY   ← your Gemini API key from aistudio.google.com
//   wrangler secret put EXTENSION_TOKEN  ← any long random string, must match CF_TOKEN in background/worker.js

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Token',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Token check
    const token = request.headers.get('X-Token');
    if (!token || token !== env.EXTENSION_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { pdf, text } = body;

    if (!pdf && !text) {
      return Response.json({ error: 'No resume content provided' }, { status: 400 });
    }

    // Build Gemini request parts
    const parts = [];

    if (pdf) {
      parts.push({
        inline_data: {
          mime_type: 'application/pdf',
          data: pdf
        }
      });
    }

    parts.push({
      text: `Analyze this resume and return ONLY a JSON object with these exact keys (no markdown, no explanation):
- "name": string (candidate's full name)
- "summary": string (2–3 sentence professional summary capturing their level and focus)
- "skills": string[] (all technical skills, languages, frameworks, tools — up to 20)
- "experience": array of objects with keys "company" (string), "role" (string), "highlights" (string[], up to 3 bullet points per role) — most recent 4 roles only
- "education": array of objects with keys "institution" (string), "degree" (string)
- "strengths": string[] (top 5 professional strengths inferred from their experience)

${text ? `Resume text:\n${text}` : ''}`
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return Response.json(
        { error: err?.error?.message || `Gemini error ${geminiRes.status}` },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const geminiData = await geminiRes.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    try {
      const result = JSON.parse(content);
      return Response.json({ result }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    } catch {
      return Response.json(
        { error: 'Failed to parse AI response' },
        { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }
};
