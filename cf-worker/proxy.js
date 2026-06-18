/**
 * Cloudflare Worker — CORS proxy for hyresult.com, hyrox.com, news.google.com
 * Deploy at: https://dash.cloudflare.com/workers
 *
 * Usage: https://YOUR-WORKER.workers.dev/?url=https://www.hyresult.com/athlete/tim-wenisch
 */

const ALLOWED_HOSTS = [
  'hyresult.com',
  'www.hyresult.com',
  'hyrox.com',
  'www.hyrox.com',
  'news.google.com',
];

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('url');

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Invalid URL', { status: 400, headers: corsHeaders() });
    }

    if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response('Host not allowed: ' + targetUrl.hostname, { status: 403, headers: corsHeaders() });
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cf: { cacheTtl: 300, cacheEverything: false }
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
        }
      });
    } catch (err) {
      return new Response('Upstream fetch failed: ' + err.message, { status: 502, headers: corsHeaders() });
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}
