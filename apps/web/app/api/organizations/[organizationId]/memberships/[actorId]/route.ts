import { handleMemberships } from '../../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ organizationId: string; actorId: string }> };
export async function PUT(request: Request, context: Context) {
  const { organizationId, actorId } = await context.params;
  return handleMemberships('grant', request, organizationId, actorId);
}
export async function PATCH(request: Request, context: Context) {
  const { organizationId, actorId } = await context.params;
  return handleMemberships('changeRole', request, organizationId, actorId);
}
export async function DELETE(request: Request, context: Context) {
  const { organizationId, actorId } = await context.params;
  return handleMemberships('revoke', request, organizationId, actorId);
}
