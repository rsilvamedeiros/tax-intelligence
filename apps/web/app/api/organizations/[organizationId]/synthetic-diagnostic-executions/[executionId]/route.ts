import { handleSyntheticDiagnostics } from '../../../../../../server/auth/runtime';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; executionId: string }> },
) {
  const { organizationId, executionId } = await context.params;
  return handleSyntheticDiagnostics(
    'get',
    request,
    organizationId,
    executionId,
  );
}
