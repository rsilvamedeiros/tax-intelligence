import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createProtocol } from './protocol';
import { InvalidLoginError } from './handlers';
describe('OIDC code flow over controlled HTTP', () => {
  let server: Server;
  let issuer: string;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  let nonce = 'expected-nonce';
  let invalidSignature = false;
  let verifier = '';
  let unavailable = false;
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url?.endsWith('/certs')) {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            keys: [
              {
                ...publicKey.export({ format: 'jwk' }),
                kid: 'synthetic',
                alg: 'RS256',
                use: 'sig',
              },
            ],
          }),
        );
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (unavailable) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'temporarily_unavailable' }));
          return;
        }
        verifier = new URLSearchParams(body).get('code_verifier') ?? '';
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
          JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'synthetic' }),
        ).toString('base64url');
        const payload = Buffer.from(
          JSON.stringify({
            iss: issuer,
            aud: 'synthetic-web',
            sub: 'synthetic-subject',
            iat: now,
            exp: now + 300,
            nonce,
          }),
        ).toString('base64url');
        const content = `${header}.${payload}`;
        const signature = sign(
          'RSA-SHA256',
          Buffer.from(content),
          privateKey,
        ).toString('base64url');
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            access_token: 'synthetic-access',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: `${content}.${invalidSignature ? 'x'.repeat(signature.length) : signature}`,
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/realms/synthetic`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(() => {
    nonce = 'expected-nonce';
    invalidSignature = false;
    unavailable = false;
  });
  const attempt = {
    state: 'expected-state',
    nonce: 'expected-nonce',
    verifier: 'v'.repeat(43),
  };
  const callback = () =>
    new URL(
      'http://127.0.0.1:3000/api/auth/callback?code=synthetic-code&state=expected-state',
    );
  const protocol = () =>
    createProtocol(issuer, 'synthetic-web', 'http://127.0.0.1:3000');
  it('builds a code request with S256 and no refresh scope', async () => {
    const url = new URL(
      await protocol().start(attempt.state, attempt.nonce, attempt.verifier),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBe(attempt.verifier);
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:3000/api/auth/callback',
    );
  });
  it('exchanges a code with the verifier and validates the signed ID token', async () => {
    expect(await protocol().exchange(callback(), attempt)).toEqual({
      accessToken: 'synthetic-access',
      expiresIn: 300,
      subject: 'synthetic-subject',
    });
    expect(verifier).toBe(attempt.verifier);
  });
  it('rejects wrong state before exchanging a code', async () => {
    await expect(
      protocol().exchange(callback(), { ...attempt, state: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidLoginError);
  });
  it('rejects nonce substitution', async () => {
    nonce = 'wrong';
    await expect(
      protocol().exchange(callback(), attempt),
    ).rejects.toBeInstanceOf(InvalidLoginError);
  });
  it('rejects an untrusted ID token signature', async () => {
    invalidSignature = true;
    await expect(
      protocol().exchange(callback(), attempt),
    ).rejects.toBeInstanceOf(InvalidLoginError);
  });
  it('preserves provider outages as operational failures', async () => {
    unavailable = true;
    await expect(
      protocol().exchange(callback(), attempt),
    ).rejects.not.toBeInstanceOf(InvalidLoginError);
  });
});
