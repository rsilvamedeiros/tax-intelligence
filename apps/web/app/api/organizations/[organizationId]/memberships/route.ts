import { handleMemberships } from '../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return handleMemberships(
    'list',
    request,
    (await context.params).organizationId,
  );
}
