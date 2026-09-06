// ninja360.org serves the run sheet.
//
// Same Cloudflare Pages project, same build — only the hostname differs. Attach
// ninja360.org (and www) as custom domains on the ninja360-co project and this
// middleware answers them with /verizon.html, so there is one source of truth
// and no second repo to keep in sync. ninja360.co and dojo.ninja360.co are
// untouched: the host check fails and the request falls through to static.

const TRACKER_HOST = /(^|\.)ninja360\.org$/i;
const TRACKER_PATH = /^\/(map|runsheet|verizon)?\/?$/i;
const PASS_THROUGH = /^\/(assets\/|favicon\.svg$)/;

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (!TRACKER_HOST.test(url.hostname)) return next();

  if (TRACKER_PATH.test(url.pathname)) {
    const asset = new URL('/verizon', url);
    const res = await env.ASSETS.fetch(new Request(asset, { headers: request.headers }));
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers });
  }

  if (PASS_THROUGH.test(url.pathname)) return next();

  return Response.redirect(new URL('/', url).toString(), 302);
}
