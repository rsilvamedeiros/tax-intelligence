import type { ReactNode } from 'react';
export function StatusCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="status-card" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
