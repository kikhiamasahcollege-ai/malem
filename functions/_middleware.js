const productionPagesHostname = 'malem.pages.dev';
const repositoryOnlyPaths = new Set([
  '/README.md',
  '/schema.sql',
  '/server.mjs',
  '/wrangler.toml',
  '/_headers',
  '/lib/local-auth-service.mjs',
  '/lib/place-service.mjs',
]);
const repositoryOnlyPrefixes = [
  '/docs/',
  '/tests/',
  '/migrations/',
  '/scripts/',
];

const canonicalBase = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !url.hostname) return null;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
};

const isCanonicalRedirectHostname = (hostname, targetHostname) => (
  hostname === productionPagesHostname
  || (!targetHostname.startsWith('www.') && hostname === `www.${targetHostname}`)
);

const isRepositoryOnlyPath = (pathname) => (
  repositoryOnlyPaths.has(pathname)
  || repositoryOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))
  || pathname.split('/').some((segment) => segment.startsWith('.') && segment !== '.well-known')
);

export async function onRequest({ request, env, next }) {
  const target = canonicalBase(env.PUBLIC_BASE_URL);
  const current = new URL(request.url);

  // Pages can retain previously deployed assets at the edge after a later
  // allowlisted build removes them. Enforce the public/private boundary before
  // static asset resolution so repository files can never be fetched directly.
  if (isRepositoryOnlyPath(current.pathname)) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // Keep branch and commit previews usable. Redirect only the stable production
  // Pages hostname and the canonical domain's www alias once a verified custom
  // HTTPS origin has been configured.
  if (
    target
    && isCanonicalRedirectHostname(current.hostname, target.hostname)
    && current.host !== target.host
  ) {
    const destination = new URL(`${current.pathname}${current.search}`, target);
    return Response.redirect(destination.toString(), 308);
  }

  return next();
}

export const __test = {
  canonicalBase,
  isCanonicalRedirectHostname,
  isRepositoryOnlyPath,
  productionPagesHostname,
};
