// Netlify serverless function: add-approved-link.js
// Permanently adds a URL to HARDCODED_APPROVED in index.html via GitHub API.
// Requires GITHUB_TOKEN env var with repo write access.
// Usage: POST /.netlify/functions/add-approved-link {"href":"https://...","label":"Description"}

exports.handler = async function(event, context) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };
    let href, label;
    try { const body = JSON.parse(event.body || '{}'); href = body.href; label = body.label; }
    catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
    if (!href || !label) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing href or label' }) };
    const REPO = 'Field-Team-6/newsletterhelper';
    const FILE = 'index.html';
    const API  = 'https://api.github.com';
    const ghHeaders = {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Blurbinator-App'
    };
    try {
        // 1. Get current file + SHA
        const getRes = await fetch(API + "/repos/" + REPO + "/contents/" + FILE, { headers: ghHeaders });
        if (!getRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not fetch file: ' + getRes.status }) };
        const fileData = await getRes.json();
        const sha = fileData.sha;
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        // 2. Check if already present
        if (currentContent.includes("'" + href + "'")) {
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Already in hardcoded list' }) };
        }
        // 3. Insert before the closing of HARDCODED_APPROVED
        const MARKER = "            };\n            function memLoad()";
        const newEntry = "                '" + href + "': '" + label.replace(/'/g, "\\'" ) + "',\n";
        if (!currentContent.includes(MARKER)) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Marker not found in index.html' }) };
        const newContent = currentContent.replace(MARKER, newEntry + MARKER);
        // 4. Commit to GitHub
        const b64 = Buffer.from(newContent, 'utf8').toString('base64');
        const putRes = await fetch(API + "/repos/" + REPO + "/contents/" + FILE, {
            method: 'PUT', headers: ghHeaders,
            body: JSON.stringify({ message: "Add approved link: " + href, content: b64, sha: sha, branch: "main" })
        });
        if (!putRes.ok) {
            const err = await putRes.json();
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'GitHub commit failed: ' + (err.message || putRes.status) }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Committed! Live after Netlify redeploys (~60s)' }) };
    } catch(err) { return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }; }
};
