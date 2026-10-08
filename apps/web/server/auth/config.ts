export function readBffConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const {
    BFF_APP_ORIGIN: origin,
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId,
    BFF_DATABASE_URL: databaseUrl,
    BFF_SESSION_ENCRYPTION_KEY: key,
    API_BASE_URL: apiBase,
  } = env;
  if (!origin || !issuer || !clientId || !databaseUrl || !key || !apiBase)
    throw new Error('BFF authentication is not configured');
  for (const value of [origin, issuer, apiBase]) {
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          local &&
          url.protocol === 'http:' &&
          (value === apiBase || env.NODE_ENV !== 'production')
        ))
    )
      throw new Error('Invalid BFF endpoint');
  }
  if (
    new URL(origin).origin !== origin ||
    issuer.endsWith('/') ||
    !/^[0-9a-f]{64}$/i.test(key)
  )
    throw new Error('Invalid BFF authentication configuration');
  return {
    origin,
    issuer,
    clientId,
    databaseUrl,
    key: Buffer.from(key, 'hex'),
    apiBase,
  };
}
