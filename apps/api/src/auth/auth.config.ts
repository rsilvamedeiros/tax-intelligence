export function readAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = [
    env.OIDC_ISSUER,
    env.OIDC_JWKS_URL,
    env.OIDC_AUDIENCE,
    env.OIDC_CLIENT_ID,
  ];
  if (values.every((value) => value === undefined)) return undefined;
  if (values.some((value) => !value || value.trim() !== value))
    throw new Error('Incomplete OIDC configuration');
  const [issuer, jwksUrl, audience, clientId] = values as [
    string,
    string,
    string,
    string,
  ];
  const urls = [new URL(issuer), new URL(jwksUrl)];
  for (const url of urls) {
    const local =
      env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid OIDC endpoint');
  }
  if (
    urls[0]!.origin !== urls[1]!.origin ||
    issuer.length > 2048 ||
    audience.length > 255 ||
    clientId.length > 255
  )
    throw new Error('Invalid OIDC configuration');
  return { issuer, jwksUrl, audience, clientId };
}
