import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { Pool } from 'pg';
type Kind = 'attempt' | 'session';
export class SessionStore {
  constructor(
    private readonly pool: Pool,
    private readonly key: Buffer,
  ) {
    if (key.length !== 32)
      throw new Error('Session encryption requires a 32-byte key');
  }
  private hash(id: string) {
    return createHash('sha256').update(id).digest('hex');
  }
  private seal(data: Record<string, unknown>, hash: string, kind: Kind) {
    const plaintext = JSON.stringify(data);
    if (Buffer.byteLength(plaintext) > 65536)
      throw new Error('Session payload too large');
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`${hash}:${kind}`));
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64url',
    );
  }
  private open(
    ciphertext: string,
    hash: string,
    kind: Kind,
  ): Record<string, unknown> {
    const bytes = Buffer.from(ciphertext, 'base64url');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      bytes.subarray(0, 12),
    );
    cipher.setAAD(Buffer.from(`${hash}:${kind}`));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const value: unknown = JSON.parse(
      Buffer.concat([
        cipher.update(bytes.subarray(28)),
        cipher.final(),
      ]).toString('utf8'),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid session payload');
    return value as Record<string, unknown>;
  }
  async insert(kind: Kind, data: Record<string, unknown>, expiresAt: Date) {
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    )
      throw new Error('Invalid session expiration');
    const id = randomBytes(32).toString('base64url'),
      hash = this.hash(id);
    const encrypted = this.seal(data, hash, kind);
    await this.pool.query(
      'DELETE FROM auth_bff.entries WHERE expires_at <= now()',
    );
    await this.pool.query(
      'INSERT INTO auth_bff.entries (id_hash, kind, ciphertext, expires_at) VALUES ($1, $2, $3, $4)',
      [hash, kind, encrypted, expiresAt],
    );
    return id;
  }
  private async load(kind: Kind, id: string, consume: boolean) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return undefined;
    const hash = this.hash(id);
    const result = await this.pool.query<{ ciphertext: string }>(
      consume
        ? 'DELETE FROM auth_bff.entries WHERE id_hash = $1 AND kind = $2 AND expires_at > now() RETURNING ciphertext'
        : 'SELECT ciphertext FROM auth_bff.entries WHERE id_hash = $1 AND kind = $2 AND expires_at > now()',
      [hash, kind],
    );
    return result.rows[0]
      ? this.open(result.rows[0].ciphertext, hash, kind)
      : undefined;
  }
  read(kind: Kind, id: string) {
    return this.load(kind, id, false);
  }
  take(kind: Kind, id: string) {
    return this.load(kind, id, true);
  }
  async revoke(kind: Kind, id: string) {
    await this.pool.query(
      'DELETE FROM auth_bff.entries WHERE id_hash = $1 AND kind = $2',
      [this.hash(id), kind],
    );
  }
}
