import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tax Intelligence Platform',
  description: 'Fundação da plataforma de inteligência empresarial',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#main-content">
          Ir para conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
