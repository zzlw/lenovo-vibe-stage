export const config = { runtime: 'edge' };

export default async function handler(request) {
  const backend = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  if (!backend) {
    return new Response(
      JSON.stringify({ code: 5000, message: 'BACKEND_URL not configured' }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  const incoming = new URL(request.url);
  const target = backend + incoming.pathname + incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    signal: AbortSignal.timeout(10_000),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch {
    return new Response(
      JSON.stringify({ code: 5020, message: 'upstream unavailable' }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }
}
