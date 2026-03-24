const https = require('https');

function post(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(options) {
  return new Promise((resolve, reject) => {
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ raw: data }); }
      });
    }).on('error', reject);
  });
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  }).toString();

  const result = await post({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (!result.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(result));
  return result.access_token;
}

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (payload.body && payload.body.size > 0 && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  return null;
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const accessToken = await getAccessToken();

    const searchResult = await get({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages?q=from:fieldteam6.org+newer_than%3A30d&maxResults=10',
      headers: { Authorization: 'Bearer ' + accessToken }
    });

    if (!searchResult.messages || searchResult.messages.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No newsletters found' }) };
    }

    // Fetch metadata for top results to find the one with highest internalDate
    let messageId = searchResult.messages[0].id;
    if (searchResult.messages.length > 1) {
      const metaFetches = searchResult.messages.slice(0, 5).map(m =>
        get({ hostname: 'gmail.googleapis.com', path: '/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=Subject', headers: { Authorization: 'Bearer ' + accessToken } })
      );
      const metas = await Promise.all(metaFetches);
      // Filter to only newsletters (subject contains "Field Team 6 Weekly") and pick newest
      const newsletters = metas.filter(m => {
        const subj = (m.payload && m.payload.headers || []).find(h => h.name.toLowerCase() === 'subject');
        return subj && subj.value.includes('Field Team 6 Weekly');
      });
      const pool = newsletters.length > 0 ? newsletters : metas;
      pool.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
      messageId = pool[0].id;
    }

    const message = await get({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/' + messageId + '?format=full',
      headers: { Authorization: 'Bearer ' + accessToken }
    });

    const subjectHeader = (message.payload.headers || []).find(h => h.name.toLowerCase() === 'subject');
    const subject = subjectHeader ? subjectHeader.value : '(no subject)';

    const dateHeader = (message.payload.headers || []).find(h => h.name.toLowerCase() === 'date');
    const date = dateHeader ? dateHeader.value : '';

    const body = extractBody(message.payload);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        messageId,
        subject,
        date,
        body: body || '(could not extract body)',
        snippet: message.snippet || ''
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
