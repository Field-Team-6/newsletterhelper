// Netlify serverless function: postcard-states.js
// Logs into postcards.fieldteam6.org and returns the campaign list
// Credentials stored as Netlify environment variables, never in code

exports.handler = async function(event, context) {
    const BASE = 'https://postcards.fieldteam6.org';
    const EMAIL = process.env.POSTCARD_EMAIL;
    const PASSWORD = process.env.POSTCARD_PASSWORD;

    if (!EMAIL || !PASSWORD) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Credentials not configured in environment variables.' })
        };
    }

    try {
        // ── Step 1: GET the login page to grab the CSRF token ──
        const loginPageRes = await fetch(`${BASE}/users/sign_in`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const loginPageHtml = await loginPageRes.text();

        // Extract CSRF token from <meta name="csrf-token" content="...">
                const csrfMatch = loginPageHtml.match(/name="csrf-token"\s+content="([^"]+)"/) || loginPageHtml.match(/content="([^"]+)"\s+name="csrf-token"/) || loginPageHtml.match(/name="authenticity_token"\s+value="([^"]+)"/) || loginPageHtml.match(/value="([^"]+)"\s+name="authenticity_token"/) || loginPageHtml.match(/authenticity_token[^>]+value="([^"]+)"/);
        if (!csrfMatch) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Could not find CSRF token on login page.' })
            };
        }
        const csrfToken = csrfMatch[1];

        // Grab session cookie from login page response
        const setCookieHeader = loginPageRes.headers.get('set-cookie') || '';
        const sessionCookie = setCookieHeader.split(';')[0]; // e.g. _session_id=abc123

        // ── Step 2: POST credentials to log in ──
        const loginBody = new URLSearchParams({
            'authenticity_token': csrfToken,
            'user[email]': EMAIL,
            'user[password]': PASSWORD,
            'user[remember_me]': '0',
            'commit': 'Log in'
        });

        const loginRes = await fetch(`${BASE}/users/sign_in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': sessionCookie,
                'User-Agent': 'Mozilla/5.0',
                'Referer': `${BASE}/users/sign_in`
            },
            body: loginBody.toString(),
            redirect: 'manual' // Don't follow redirects — we need the new session cookie
        });

        // Get the authenticated session cookie from the login response
        const authCookieRaw = loginRes.headers.get('set-cookie') || '';
        const authCookie = authCookieRaw.split(';')[0];

        if (!authCookie) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Login failed — could not get session cookie.' })
            };
        }

        // ── Step 3: Fetch the campaign page with the authenticated session ──
        const campaignRes = await fetch(`${BASE}/select_campaign`, {
            headers: {
                'Cookie': authCookie,
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!campaignRes.ok) {
            return {
                statusCode: campaignRes.status,
                body: JSON.stringify({ error: `Campaign page returned ${campaignRes.status}` })
            };
        }

        const campaignHtml = await campaignRes.text();

        // ── Step 4: Parse campaign option text from the HTML ──
        // Options look like: <option value="1">AZ-01 - Voter Registration Outreach - ...</option>
        const optionMatches = [...campaignHtml.matchAll(/<option[^>]*>([^<]+)<\/option>/g)];
        const options = optionMatches
            .map(m => m[1].trim())
            .filter(t => t.length > 0 && !t.toLowerCase().includes('select'));

        // Extract unique 2-letter state abbreviations
        const stateSet = new Set();
        options.forEach(text => {
            const match = text.match(/^([A-Z]{2})[\s\-]/);
            if (match) stateSet.add(match[1]);
        });

        const states = Array.from(stateSet).sort();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ states, options })
        };

    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};
