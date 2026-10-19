# Validação da proposta de prova RLS

Entrega exclusivamente documental: [RFC 0002](../rfc/0002-synthetic-rls-proof.md) e [plano de TDD](synthetic-rls-test-plan.md). Base de trabalho: commit `210d123` da PR #16, ainda aberta na inspeção inicial de 19/10/2026. Nenhuma mudança em código, migrations, dependências ou privilégios.

## Plano e revisão

Inspecionados status/diff, scripts/CI, arquitetura, ADR 0003, RFC 0001, matriz de testes, adapters de administração e testes de persistência. Consultadas fontes oficiais PostgreSQL 17/18 citadas na RFC. Aplicadas skills de arquitetura, persistência e manutenção documental; revisão local avalia autorização, limites da prova, pool/roles e coerência de alegações.

Próxima etapa proposta é prova descartável em banco de teste, pois tabela real de domínio não foi autorizada. Preservar lookup de identidade/membership, credencial BFF e esquema atual. Implementação depende de aceite; não criar ADR de decisão aceita nem alterar silenciosamente a autorização do AGENTS.

## Evidências e limites

`pnpm format:check`, `pnpm validate:docs` e `git diff --check` aprovados: 87 Markdown e 16 skills; validador não verifica links externos/âncoras. Fontes externas foram consultadas separadamente. Revisão local sem achado bloqueante: proposta distingue grants, policies, contexto de sessão/transação e limite de setting mutável, sem alegar autenticação por RLS.

Casos RLS-01 a RLS-12 são planejamento, não testes executados; nenhum resultado Red/Green é atribuído a esta entrega. Testes de aplicação não foram repetidos localmente para alterações exclusivamente documentais. Não há implementação RLS, proteção contra SQL arbitrário comprometido, migration ou validação de domínio/produção.

Na [PR #17](https://github.com/rsilvamedeiros/tax-intelligence/pull/17), encadeada sobre a PR #16, o commit `39b3e6c03a757ba963324ab2f4d5cefa29b929f3` passou nos sete jobs de Actions: documentação, quality, integração PostgreSQL, identity-provider, E2E, audit e secret-scan. Essas regressões do código herdado não executam os casos RLS planejados. GitGuardian aprovou os dois commits sem segredos detectados.

Revisão automática do CodeRabbit foi pulada por a base ser uma branch diferente da padrão. Solicitação manual de revisão completa foi reconhecida: [relatório sem comentários acionáveis](https://github.com/rsilvamedeiros/tax-intelligence/pull/17#issuecomment-6269661870) para alterações desde `210d1239f1fcda492c8dc7b40c8eaf2d86344dfe` até aquele commit e [execução concluída](https://github.com/rsilvamedeiros/tax-intelligence/pull/17#issuecomment-6269668842). Nenhuma configuração remota foi alterada. Revisão humana e aceite do escopo permanecem necessários.

Este registro posterior altera somente evidências documentais. Conferir checks e commit status externos novamente no commit final; não atribuir a revisão anterior a mudanças posteriores. Integrar a PR #16 antes da proposta encadeada, preservando a ordem de revisão.
