const ALLOWED_ORIGIN = 'https://najibyazbeck36-boop.github.io';
const MAX_BODY_BYTES = 256 * 1024;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function jsonResponse(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed.' } }, 403, 'null');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') return jsonResponse({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST is required.' } }, 405, origin);

    const contentType = request.headers.get('Content-Type') || '';
    if (!/^(application\/json|text\/plain)(?:;|$)/i.test(contentType)) {
      return jsonResponse({ ok: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON is required.' } }, 415, origin);
    }
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return jsonResponse({ ok: false, error: { code: 'REQUEST_TOO_LARGE', message: 'Request is too large.' } }, 413, origin);

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return jsonResponse({ ok: false, error: { code: 'REQUEST_TOO_LARGE', message: 'Request is too large.' } }, 413, origin);

    try {
      const upstream = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
      if (!upstream.ok) throw new Error('Upstream request failed.');
      const responseBody = await upstream.arrayBuffer();
      if (responseBody.byteLength > MAX_BODY_BYTES) throw new Error('Upstream response is too large.');
      JSON.parse(new TextDecoder().decode(responseBody));
      return new Response(responseBody, {
        status: 200,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }
      });
    } catch (_error) {
      return jsonResponse({ ok: false, error: { code: 'NETWORK_ERROR', message: 'Household cloud is temporarily unavailable. Please try again. Your local data is safe.' } }, 502, origin);
    }
  }
};
