# Validação da prova sintética RLS

Escopo: [ADR 0016](../adr/0016-synthetic-rls-proof.md). Base: PR #18 integrada, main `ee9e2fc`. [Plano de testes](synthetic-rls-test-plan.md).

## Plano

Documentação e AGENTS antes do teste. Provisionar fixture/login isolados com PostgreSQL real; observar Red de leitura sem RLS antes de aplicar policies, depois escritas e tratamento de conexão por comportamento. Executar os 12 cenários e a integração completa. Separar checks efetivamente executados de planos; conferir cleanup, CI, GitGuardian e revisão independente antes da entrega.

## Evidências

Fixture privada implementada em [synthetic-rls.spec.ts](../../packages/database/src/synthetic-rls.spec.ts), sem export público, nova migration, dependência ou mudança de grants de produção. Owner provisiona objetos exclusivos; assertions usam login restrito sem superuser/BYPASSRLS/ownership, sem memberships assumíveis e com grants verificados individualmente. ENABLE/FORCE e sete policies específicas da role são conferidos antes de cada caso. Cleanup confirma ausência do schema e da role após fechar o pool.

## Red/Green observado

RLS-01: sem RLS, consulta sem filtro retornou A e B; um teste falhou. Ativação e policy de leitura levaram a um teste aprovado. RLS-03: com leitura restrita, mas escrita provisória permissiva e grants corretos, INSERT de B e evento foram aceitos; um teste falhou e um passou. WITH CHECK restrito ao tenant levou aos dois testes aprovados.

Oito regressões complementares de contexto inválido, mutações, FK, commit/rollback, privilégio mínimo e setting mutável passaram depois das policies: dez casos aprovados. Não atribuir TDD retroativo a esses cenários.

RLS-08: contexto de sessão A contaminou a conexão e o callback consultou A sem contexto novo; um teste falhou e dez passaram. Checagem de baseline antes do BEGIN e descarte da conexão contaminada corrigiram o comportamento. RLS-09 foi acrescentado depois dessa proteção: encerra somente o próprio PoolClient, tornando ROLLBACK realmente indisponível; erro original é preservado, PID muda e nova conexão não herda contexto. É regressão complementar, sem alegação de Red específico para esse cenário.

Resultado local: 12 casos aprovados em PostgreSQL 18.1; integração completa com 82 testes aprovados. Casos adicionais dentro da mesma matriz verificam leitura de referências A/B, INSERT cruzado em todas as relações e permissões/grupos reais, sem inflar a contagem de testes.

## Verificações e limites

Lint e tipos do monorepo aprovados; compilação TypeScript explícita do novo spec também aprovada com configuração local temporária, pois specs são excluídos do build padrão. Build aprovado e código de fixture excluído dos artefatos de runtime. Cobertura: 364 testes aprovados (176 API, 35 contratos, 64 web e 89 BFF), metas preservadas. Integração da API compilada/RSA com role restrita e smokes de autenticação/OTLP aprovados. Audit: exit 0, uma vulnerabilidade moderada, sem high/critical. Formato e validador documental aprovados (90 Markdown e 16 skills).

Inspeção adicional do catálogo após os ciclos confirmou zero schemas/roles da prova remanescentes. Revisão local verificou SQL parametrizado para dados/contexto, identificadores gerados por allowlist hexadecimal, role autenticada/restrita, grants individuais, policies por comando, preservação do erro original e descarte de conexão. Sem achado bloqueante local; isso não substitui revisão independente/humana. Conferir resultados remotos pelo head entregue, incluindo GitGuardian e commit statuses externos.

RLS-01/02/04/05 demonstram leitura/escrita/FK da fixture; RLS-06/07 usam PID real para provar reutilização após commit, rollback e erro recuperável; RLS-08/09 descartam conexões contaminadas/inutilizáveis; RLS-10 demonstra atomicidade registro/evento somente na fixture. RLS-11 verifica privilégio mínimo e RLS-12 confirma que SQL arbitrário pode trocar o setting e então consultar B: não é autenticação nem proteção contra runtime comprometido.

Esta etapa não habilita RLS nas tabelas da aplicação, não conclui DB-03 nem a primeira vertical. [Status do projeto](project-status.md) preserva essa distinção. Revisão local e remota devem registrar achados reais e aprovação humana antes de merge. Jornadas web não foram repetidas localmente nesta etapa de banco/testes; regressões remotas permanecem exigidas.
