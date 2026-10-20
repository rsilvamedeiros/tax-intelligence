import { handleSyntheticBatches } from '../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return handleSyntheticBatches(
    'create',
    request,
    (await context.params).organizationId,
  );
}
