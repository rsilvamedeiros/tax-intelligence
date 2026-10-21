import { handleSyntheticBatches } from '../../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; batchId: string }> },
) {
  const { organizationId, batchId } = await context.params;
  return handleSyntheticBatches('get', request, organizationId, batchId);
}
