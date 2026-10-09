export function createBrowserMembershipFixture(
  issuer: string,
  subject: string,
): Promise<{
  ids: string[];
  apiUrl: string;
  bffUrl: string;
  cleanup(): Promise<void>;
}>;
export function revokeBrowserMembership(
  id: unknown,
  allowedIds: unknown,
): Promise<null>;
