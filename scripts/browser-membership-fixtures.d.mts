export function createBrowserMembershipFixture(
  issuer: string,
  subject: string,
): Promise<{
  ids: string[];
  actors: string[];
  apiUrl: string;
  bffUrl: string;
  batchUrl: string;
  diagnosticUrl: string;
  cleanup(): Promise<void>;
}>;
export function revokeBrowserMembership(
  id: unknown,
  allowedIds: unknown,
): Promise<null>;
