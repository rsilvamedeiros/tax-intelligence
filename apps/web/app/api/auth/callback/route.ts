import { handleAuth } from '../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = (request: Request) => handleAuth('callback', request);
