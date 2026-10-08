import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, customFetch, errors } from 'jose';
import {
  authenticatedIdentitySchema,
  type AuthenticatedIdentity,
} from '@tax/contracts';
import { readAuthConfig } from './auth.config';

@Injectable()
export class AuthService {
  private readonly config = readAuthConfig();
  private readonly keys = this.config
    ? createRemoteJWKSet(new URL(this.config.jwksUrl), {
        timeoutDuration: 2000,
        cacheMaxAge: 300_000,
        cooldownDuration: 5000,
        [customFetch]: (url, options) =>
          fetch(url, { ...options, redirect: 'error' }),
      })
    : undefined;

  async verify(
    authorization: string | undefined,
  ): Promise<AuthenticatedIdentity> {
    // Bound the input and reject malformed transport before any remote lookup.
    const match =
      authorization && authorization.length <= 8192
        ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
            authorization,
          )
        : null;
    if (!match) throw new UnauthorizedException();
    if (!this.config || !this.keys) throw new ServiceUnavailableException();
    try {
      const { payload } = await jwtVerify(match[1]!, this.keys, {
        algorithms: ['RS256'],
        typ: 'JWT',
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat'],
        clockTolerance: 5,
        maxTokenAge: 300,
      });
      const now = Math.floor(Date.now() / 1000);
      if (
        payload.typ !== 'Bearer' ||
        payload.azp !== this.config.clientId ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        payload.iat > now + 5 ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 300
      )
        throw new UnauthorizedException();
      const identity = authenticatedIdentitySchema.safeParse({
        issuer: payload.iss,
        subject: payload.sub,
      });
      if (!identity.success) throw new UnauthorizedException();
      return identity.data;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (
        error instanceof errors.JOSEError &&
        [
          'ERR_JWT_CLAIM_VALIDATION_FAILED',
          'ERR_JWT_EXPIRED',
          'ERR_JOSE_ALG_NOT_ALLOWED',
          'ERR_JOSE_NOT_SUPPORTED',
          'ERR_JWS_INVALID',
          'ERR_JWT_INVALID',
          'ERR_JWKS_NO_MATCHING_KEY',
          'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
        ].includes(error.code)
      )
        throw new UnauthorizedException();
      // Transport/timeouts/malformed provider responses fail closed without exposing details.
      throw new ServiceUnavailableException();
    }
  }
}
