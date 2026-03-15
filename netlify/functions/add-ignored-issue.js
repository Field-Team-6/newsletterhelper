// Netlify serverless function: add-ignored-issue.js
// Adds an issue key to BLURBINATOR_HARDCODED_IGNORED in index.html via GitHub API.
// Requires GITHUB_TOKEN env var.
// Usage: POST /.netlify/functions/add-ignored-issue {"key": "CATEGORY::quote"}

exports.handler = async function(event, context) {
    const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }) };
    let key;
    try { key = JSON.parse(event.body || '{}').key; } catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
    if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing key' }) };
    const REPO = 'Field-Team-6/newsletterhelper';
    const FILE = 'index.html';
    const API  = 'https://api.github.com';
    const ghHeaders = {'Authorization': 'token ' + token,'Accept': 'application/vnd.github.v3+json','Content-Type': 'application/json','User-Agent': 'Blurbinator-App'};
    try {
        const getRes = await fetch(API + "/repos/" + REPO + "/contents/" + FILE, { headers: ghHeaders });
        if (!getRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not fetch file: ' + getRes.status }) };
        const fileData = await getRes.json();
        const sha = fileData.sha;
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        // Check if already present
        if (currentContent.includes("'" + key + "'")) {
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Already ignored' }) };
        }
        // Insert before the closing bracket of BLURBINATOR_HARDCODED_IGNORED
        const MARKER = '        ];\n\n        function prCopyFix';
        const safeKey = key.replace(/[\r\n]/g, ' ').replace(/'/g, "\\'");
        const newEntry = "                '" + safeKey + "',\n";
        if (!currentContent.includes(MARKER)) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Marker not found in index.html' }) };
        const newContent = currentContent.replace(MARKER, newEntry + MARKER);
        const b64 = Buffer.from(newContent, 'utf8').toString('base64');
        const putRes = await fetch(API + "/repos/" + REPO + "/contents/" + FILE, {
            method: 'PUT', headers: ghHeaders,
            body: JSON.stringify({ message: "Ignore issue: " + key.substring(0,60), content: b64, sha: sha, branch: "main" })
        });
        if (!putRes.ok) { const err = await putRes.json(); return { statusCode: 500, headers, body: JSON.stringify({ error: "GitHub commit failed: " + (err.message || putRes.status) }) }; }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Committed! Live in ~60s' }) };
    } catch(err) { return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }; }
};
