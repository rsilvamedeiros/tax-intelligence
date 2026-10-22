# Validação da persistência de diagnóstico sintético

Etapa do [ADR 0024](../adr/0024-synthetic-diagnostic-persistence.md), em 22/10/2026. PRs #27/#28 abertas no início; branch dependente, sem merge automático. Migration 0007, snapshot Fiscal público, store transacional e evento Audit, com pool injetado. Nenhuma credencial/runtime HTTP ou endpoint foi adicionado.

## TDD e falhas observadas

Três ciclos Red/Green observados em PostgreSQL válido com login realmente autenticado e restrito: execução indisponível no stub; callback inseria execução sem evento e confirmava; callback deixava INSERT sem await e confirmava antes da conferência. Correções: transação/capacidades, conferência de completude da auditoria e rastreamento de operações pendentes com descarte de conexão. Schema/migration e demais regressões não são alegados como Reds individuais. A tentativa de filtrar um teste com `-t` foi rejeitada pelo wrapper PowerShell; repetida com `--testNamePattern`, e só a falha comportamental conta como Red.

Regressão inicial: teste antigo contava todas as relações dos schemas Fiscal/Audit e esperava quatro; a nova auditoria elevou a contagem para cinco. Seleção foi delimitada às quatro relações originais, preservando suas asserções; novo teste verifica ENABLE/FORCE/ownership nas duas relações de diagnóstico. Não houve remoção de teste, relaxamento de policy ou redução de cobertura.

36 testes PostgreSQL novos cobrem papéis persistidos, A/B, SELECT sem filtro, INSERT cruzado, FK composta, grants excessivos/ausentes/PUBLIC/membership de roles, rollback real por erro do evento e callback, COMMIT abortado, capacidades retidas, conexão contaminada, reutilização de backend, CHECK JSONB, concorrência em duas conexões, precheck sem lock, revalidação após revogação/rebaixamento, ordem inversa, lock_timeout, rollback impossível preservando erro e callback travado limitado por prazo real. O caso de prazo tem limite de teste de 15 segundos para observar o deadline real de 10 segundos; demais testes mantêm seus limites.

## Evidências por ambiente

- PostgreSQL local 18.1, cluster isolado iniciado para a etapa, somente TEST_DATABASE_URL `_test` e fixtures sintéticas. `pnpm test:integration`: 144 testes em dez suítes aprovados, incluindo 36 testes novos do adapter.
- `pnpm test:integration:synthetic-diagnostic`: serviço compilado do ADR 0023 com store/login reais; criação concorrente/replay, cálculo e evidência, viewer read/write denial, negação A/B, resultado adulterado, falha por trigger real de auditoria com rollback e revogação aprovados. Script não é teste HTTP/Bearer e não simula autenticação de navegador.
- Primeira cobertura paralela falhou por timeout de cinco segundos no teste existente de inclusão de dez documentos da UI. Não houve alteração de código ou limite desse teste; `pnpm exec turbo test:coverage --concurrency=1` passou com 760 testes. Não atribuir causa sem comprovação.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` e `pnpm test:smoke` aprovados. Smoke cobre autenticação e OTLP existentes, sem rotas novas. `pnpm audit:dependencies` concluiu com código zero e um aviso moderado; nenhuma dependência adicionada.

`pnpm test:integration:synthetic-batch` também passou após extração do snapshot público. Formato e validação de 110 documentos/16 manifests aprovados; diff sem erros de whitespace. Cleanup verificou ausência de roles descartáveis, lotes, execuções, eventos e funções de falha; cluster iniciado pela etapa foi parado.

PR #29 aberta como rascunho, dependente da PR #28. Em a3e5da7, o [CI](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39804249004) aprovou 144 testes/dez suítes em PostgreSQL 17.11, composição do serviço de diagnóstico e integração HTTP do lote. E2E, qualidade, auditoria de dependências, documentação e ambos os scanners passaram; identity-provider ainda em execução nessa conferência. CodeRabbit recusou a revisão solicitada por limite de uso, informando nova disponibilidade em 27 minutos; nenhum review foi produzido. Seu status verde não comprova revisão. Revisão externa e aceite humano permanecem pendentes.

Revisão local é autorrevisão estática de privilégios, leases, tempo e transação; sem achado bloqueante identificado, sem aprovação automática de segurança. Segurança humana e revisão externa são distintas. As pendências da PR #28 foram retomadas: CodeRabbit revisou 16 arquivos em 6e18b7f, achado documental corrigido em 2ca28b3, com thread resolvida e oito checks aprovados.

## Correções posteriores da PR #29

PR #28 integrada; #29 redirecionada a main e retirada de draft para revisão humana. CodeRabbit revisou 24 arquivos em f2611dd; único achado documental corrigido em 321ee14 e thread resolvida. A declaração anterior de limite de revisão descreve a tentativa inicial, não o estado atual.

O check dependency-audit de 321ee14 falhou com dois alertas críticos e um alto em Next.js 16.4.0. Atualização pontual para 16.4.1 conforme [release oficial](https://github.com/vercel/next.js/releases/tag/v16.4.1), com lockfile regenerado. `pnpm audit:dependencies` voltou a concluir com código zero, restando um alerta moderado. Nenhum scanner suprimido ou limiar reduzido. Na árvore da entrega HTTP em preparação, build Next.js 16.4.1 e os 285 testes web/BFF com cobertura passaram; CI da branch de persistência verificará a correção no seu próprio recorte.

## Limites e próximo módulo

RLS protege seis relações sintéticas, sem RLS de controle ou proteção contra owner/SQL arbitrário comprometido. Aritmética e equivalência continuam em application; SQL valida estrutura básica/bytes e referências, não parecer tributário. Login de migration/teste owner é distinto do login real restrito exercitado; grants/roles não são provisionados no runtime. Operações criadas por este adapter exigem evento, mas isso não transforma auditoria em imutabilidade contra administrador do banco.

Próximo módulo: composição HTTP com configuração exclusiva, autenticação e limites de transporte, mediante ADR/TDD próprios. BFF/UI de diagnóstico e prova OTLP específica continuam posteriores. Primeira vertical e produção não estão concluídas; sem deploy ou aplicação de migration em banco existente do usuário.
