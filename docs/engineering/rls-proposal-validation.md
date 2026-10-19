# Validação da proposta de prova RLS

Entrega exclusivamente documental: [RFC 0002](../rfc/0002-synthetic-rls-proof.md) e [plano de TDD](synthetic-rls-test-plan.md). Base de trabalho: commit `210d123` da PR #16, ainda aberta na inspeção inicial de 19/10/2026. Nenhuma mudança em código, migrations, dependências ou privilégios.

## Plano e revisão

Inspecionados status/diff, scripts/CI, arquitetura, ADR 0003, RFC 0001, matriz de testes, adapters de administração e testes de persistência. Consultadas fontes oficiais PostgreSQL 17/18 citadas na RFC. Aplicadas skills de arquitetura, persistência e manutenção documental; revisão local avalia autorização, limites da prova, pool/roles e coerência de alegações.

Próxima etapa proposta é prova descartável em banco de teste, pois tabela real de domínio não foi autorizada. Preservar lookup de identidade/membership, credencial BFF e esquema atual. Implementação depende de aceite; não criar ADR de decisão aceita nem alterar silenciosamente a autorização do AGENTS.

## Evidências e limites

`pnpm format:check`, `pnpm validate:docs` e `git diff --check` aprovados: 87 Markdown e 16 skills; validador não verifica links externos/âncoras. Fontes externas foram consultadas separadamente. Revisão local sem achado bloqueante: proposta distingue grants, policies, contexto de sessão/transação e limite de setting mutável, sem alegar autenticação por RLS.

Casos RLS-01 a RLS-12 são planejamento, não testes executados; nenhum resultado Red/Green é atribuído a esta entrega. Testes de aplicação não foram repetidos localmente para alterações exclusivamente documentais. CI e revisão remota desta proposta ainda pendentes. Não há implementação RLS, proteção contra SQL arbitrário comprometido, migration ou validação de domínio/produção.
