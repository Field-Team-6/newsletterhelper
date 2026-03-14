// Netlify serverless function: mobilize-proxy.js
// Proxies Mobilize API event lookups server-side to avoid browser CORS restrictions.
// Usage: /.netlify/functions/mobilize-proxy?eventId=12345

exports.handler = async function(event, context) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET'
    };

    const eventId = event.queryStringParameters && event.queryStringParameters.eventId;
    if (!eventId || !/^\d+$/.test(eventId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing or invalid eventId parameter' })
        };
    }

    try {
        const res = await fetch(`https://api.mobilize.us/v1/events/${eventId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!res.ok) {
            return {
                statusCode: res.status,
                headers,
                body: JSON.stringify({ error: `Mobilize API returned ${res.status}` })
            };
        }

        const data = await res.json();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
