'use client';
import { AuthPanel } from './auth-panel';
import { OrganizationPanel } from './organization-panel';
export function AccessPanel() {
  return (
    <AuthPanel>
      <OrganizationPanel />
    </AuthPanel>
  );
}
