import { handleOrganizations } from '../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return handleOrganizations(request, (await context.params).organizationId);
}
