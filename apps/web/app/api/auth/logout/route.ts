import { handleAuth } from '../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const POST = (request: Request) => handleAuth('logout', request);
