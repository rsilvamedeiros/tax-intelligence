import { HealthPanel } from './components/health-panel';
import { AccessPanel } from './components/access-panel';
export default function Home() {
  return (
    <main id="main-content">
      <header>
        <p className="eyebrow">TAX INTELLIGENCE PLATFORM</p>
        <h1>Inteligência com rastreabilidade</h1>
        <p>
          Fundação técnica para conectar dados fiscais, tributários,
          trabalhistas e financeiros.
        </p>
      </header>
      <HealthPanel />
      <AccessPanel />
      <section aria-labelledby="scope-heading">
        <h2 id="scope-heading">Próxima etapa</h2>
        <p>
          A primeira jornada de diagnóstico está planejada e depende de
          autorização para implementação. Nenhuma regra tributária está ativa.
        </p>
      </section>
      <footer>Ambiente de desenvolvimento · Fundação 0.1.0</footer>
    </main>
  );
}
