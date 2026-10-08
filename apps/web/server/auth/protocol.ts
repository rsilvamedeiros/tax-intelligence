import * as oidc from 'openid-client';
import { InvalidLoginError } from './handlers';
export function createProtocol(
  issuer: string,
  clientId: string,
  origin: string,
) {
  const config = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
      token_endpoint: `${issuer}/protocol/openid-connect/token`,
      jwks_uri: `${issuer}/protocol/openid-connect/certs`,
    },
    clientId,
    { id_token_signed_response_alg: 'RS256' },
    oidc.None(),
  );
  if (issuer.startsWith('http:')) oidc.allowInsecureRequests(config);
  oidc.enableNonRepudiationChecks(config);
  config.timeout = 3;
  config[oidc.customFetch] = async (url, options) => {
    const response = await fetch(url, {
      ...options,
      body:
        options.body instanceof Uint8Array
          ? new Uint8Array(options.body)
          : options.body,
      redirect: 'error',
    });
    if (response.status >= 500)
      throw new Error('Identity provider unavailable');
    return response;
  };
  return {
    async start(state: string, nonce: string, verifier: string) {
      return oidc.buildAuthorizationUrl(config, {
        redirect_uri: `${origin}/api/auth/callback`,
        scope: 'openid',
        response_type: 'code',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      }).href;
    },
    async exchange(url: URL, attempt: Record<string, unknown>) {
      if (
        typeof attempt.state !== 'string' ||
        typeof attempt.nonce !== 'string' ||
        typeof attempt.verifier !== 'string'
      )
        throw new InvalidLoginError();
      try {
        const tokens = await oidc.authorizationCodeGrant(config, url, {
          expectedState: attempt.state,
          expectedNonce: attempt.nonce,
          pkceCodeVerifier: attempt.verifier,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        if (
          !claims ||
          typeof claims.sub !== 'string' ||
          typeof tokens.expires_in !== 'number'
        )
          throw new InvalidLoginError();
        return {
          accessToken: tokens.access_token,
          expiresIn: tokens.expires_in,
          subject: claims.sub,
        };
      } catch (error) {
        if (
          (error instanceof oidc.ClientError &&
            error.code &&
            !['OAUTH_TIMEOUT', 'OAUTH_ABORT'].includes(error.code)) ||
          error instanceof oidc.AuthorizationResponseError ||
          error instanceof oidc.ResponseBodyError
        )
          throw new InvalidLoginError();
        throw error;
      }
    },
  };
}
