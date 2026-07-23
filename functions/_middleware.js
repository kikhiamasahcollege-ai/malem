const productionPagesHostname = 'malem.pages.dev';

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

export async function onRequest({ request, env, next }) {
  const target = canonicalBase(env.PUBLIC_BASE_URL);
  const current = new URL(request.url);

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
  productionPagesHostname,
};
