export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT inválida');
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATABASE_URL)
    throw new Error('DATABASE_URL obrigatória em produção');
  const origin =
    env.CORS_ORIGIN ?? (production ? undefined : 'http://localhost:3000');
  if (!origin) throw new Error('CORS_ORIGIN obrigatória em produção');
  const url = new URL(origin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== origin ||
    (production && url.protocol !== 'https:')
  )
    throw new Error(
      'CORS_ORIGIN deve ser uma origem HTTP(S) exata; HTTPS em produção',
    );
  return { port, production, origin };
}
