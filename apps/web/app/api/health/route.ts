import { NextResponse } from 'next/server';
import { healthResponseSchema } from '@tax/contracts';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
    const response = await fetch(new URL('/v1/health/ready', base), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Upstream failed');
    const health = healthResponseSchema.parse(await response.json());
    if (health.status !== 'ok') throw new Error('Upstream not ready');
    return NextResponse.json(health, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { message: 'API indisponível' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
