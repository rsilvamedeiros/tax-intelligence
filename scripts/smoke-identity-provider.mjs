import assert from 'node:assert/strict';
const issuer = 'http://127.0.0.1:8080/realms/tax-intelligence';
let discovery;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (response.ok) {
      discovery = await response.json();
      break;
    }
  } catch {
    /* bounded provider startup polling */
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
assert.ok(discovery, 'Development identity provider did not become ready');
assert.equal(discovery.issuer, issuer);
assert.ok(discovery.code_challenge_methods_supported.includes('S256'));
assert.ok(discovery.id_token_signing_alg_values_supported.includes('RS256'));
assert.equal(discovery.jwks_uri, `${issuer}/protocol/openid-connect/certs`);
const response = await fetch(discovery.jwks_uri, {
  signal: AbortSignal.timeout(2000),
  redirect: 'error',
});
assert.ok(response.ok);
const jwks = await response.json();
assert.ok(
  jwks.keys.some(
    (key) => key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig',
  ),
);
console.log(
  'Identity provider smoke passed: imported realm, issuer, PKCE metadata and RSA signing keys available. Browser login is not covered.',
);
