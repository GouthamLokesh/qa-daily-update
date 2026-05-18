/**
 * QA Daily Update — Cloudflare Worker Proxy
 * Forwards requests from GitHub Pages to self-hosted Jira
 * with proper CORS headers.
 *
 * Deploy at: https://workers.cloudflare.com
 */

const JIRA_BASE   = 'https://jdac.unilogcorp.com';
const ALLOWED_ORIGIN = 'https://gouthamlokesh.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request) {
    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Only allow /jira/* paths
    if (!url.pathname.startsWith('/jira/')) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }

    // Strip /jira prefix and forward to Jira
    const jiraPath   = url.pathname.replace('/jira', '');
    const jiraUrl    = `${JIRA_BASE}${jiraPath}${url.search}`;

    // Forward the request with original headers (includes Authorization: Bearer PAT)
    const jiraRequest = new Request(jiraUrl, {
      method:  request.method,
      headers: request.headers,
      body:    request.method !== 'GET' && request.method !== 'HEAD'
               ? request.body
               : undefined,
    });

    try {
      const jiraResponse = await fetch(jiraRequest);

      // Build response with CORS headers added
      const responseHeaders = new Headers(jiraResponse.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));

      return new Response(jiraResponse.body, {
        status:  jiraResponse.status,
        headers: responseHeaders,
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status:  502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }
};
