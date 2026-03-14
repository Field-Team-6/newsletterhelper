// Netlify serverless function: ai-check.js
// Proxies AI link-verification requests to the Anthropic API server-side.
// Requires ANTHROPIC_API_KEY environment variable set in Netlify dashboard.
// Usage: POST /.netlify/functions/ai-check  { "prompt": "..." }

exports.handler = async function(event, context) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    let prompt;
    try {
        const body = JSON.parse(event.body || '{}');
        prompt = body.prompt;
    } catch(e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    if (!prompt || typeof prompt !== 'string') {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt parameter' }) };
    }

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = await res.json();

        if (!res.ok) {
            return {
                statusCode: res.status,
                headers,
                body: JSON.stringify({ error: data.error || 'Anthropic API error ' + res.status })
            };
        }

        const text = (data.content && data.content[0] && data.content[0].text) || '';
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ text })
        };

    } catch(err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
