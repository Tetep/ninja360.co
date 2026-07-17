function parseBasicPassword(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const encoded = authorizationHeader.slice(6).trim();
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(':');

    // Username is intentionally ignored. Password is everything after the first ':'.
    return separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const expectedPassword = context.env.DOJO_PASS;
  const providedPassword = parseBasicPassword(context.request.headers.get('Authorization'));

  if (providedPassword === expectedPassword && expectedPassword) {
    return context.next();
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Ninja360 Dojo", charset="UTF-8"',
    },
  });
}
