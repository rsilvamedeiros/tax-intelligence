# Validação da persistência do lote sintético

Escopo: [ADR 0018](../adr/0018-synthetic-document-persistence.md). Base PR #21 integrada (`1dfd8e2`); plano e critérios na decisão. API HTTP, wiring de credencial, UI e diagnóstico permanecem fora desta etapa.

## Implementação e fronteiras

Migration 0006 cria três relações normalizadas do lote e evento em schema de auditoria; sete policies com ENABLE/FORCE. Nenhum GRANT a PUBLIC, login ou credencial criado pela migration. Login de teste é autenticado, sem bypass/ownership/memberships assumíveis, com permissões mínimas explícitas. Adapters públicos de Identity/Organizations/Audit são compostos na mesma conexão pelo store de lotes; não há SQL de controle/auditoria no adapter Fiscal.

O pacote database passa a usar os schemas existentes de contracts: somente dependência interna workspace, três linhas de lockfile e nenhuma versão externa alterada. Entrada/replay/leitura passam pelos contratos; conteúdo bruto não é armazenado. Comparação usa as duas projeções JSON normalizadas, sem hash como autoridade. Pool dedicado é injetado; aplicação não recebe variável ou acesso novo até a etapa HTTP.

## Red/Green observado

1. Ambiente/migration/grants válidos, scaffold recusava toda criação: um teste falhou por receber denied em vez de created. Implementação transacional levou a um aprovado com lote e evento confirmados.
2. Replay ainda inseria de novo e colidia com a unicidade; consulta devolvia not_found. Dois testes falharam e um passou. Lookup escopado, comparação normalizada e consulta fecharam o ciclo com três aprovados.
3. Após 23 regressões aprovadas, novo caso com `-0` revelou conflito no replay do mesmo JSON: um teste selecionado falhou por conflict em vez de replayed. Igualdade canônica JSON corrigiu a diferença com o zero armazenado; os 24 casos e a integração completa passaram. Não houve alteração de migration já aplicada.

Os negativos e cenários concorrentes adicionais são regressões acrescentadas após os primeiros adapters; não alegar Red individual nem TDD retroativo de todos os 24 testes. Problema inicial de bind da porta Windows foi resolvido escolhendo porta local disponível do cluster próprio e não contou como Red.

## Verificações locais em 20/10/2026

- PostgreSQL 18.1 real isolado: 106 testes, nove suites, aprovados com cobertura; 24 casos novos. Pacote database: 97,41% statements, 97,59% branches, 97,87% functions e 99,05% lines; metas mantidas.
- Casos novos: criação/consulta/replay/conflito, tenant/ator/chave, quatro papéis, identidade desconhecida, revogação, FORCE RLS sem filtro, contexto ausente/inválido, FKs compostas, limites, rollback da auditoria, falta de privilégios, contaminação do pool e migração repetida. Teste com setting trocado deliberadamente confirma que contexto SQL mutável não autentica tenant.
- Concorrência observada via pg_blocking_pids: duplicatas em PIDs distintos, recusa antes do lock, espera por revoke/rebaixamento dos stores administrativos reais e revalidação, além de criação autorizada confirmada antes de revoke em espera. Nenhum sleep usado como prova de ordem.
- Falha irrecuperável: termina somente backend da role efêmera própria enquanto a criação aguarda a auditoria; erro original 57P01 preservado, rollback impossível, PID trocado e conexão nova sem contexto. Nenhum processo/sessão do usuário foi terminado.
- Lint, tipos do monorepo e compilação TypeScript explícita do novo spec aprovados. Cobertura do monorepo: 424 testes aprovados; build, integração da API compilada/RSA/membership e smokes OTLP/autenticação aprovados. Audit: exit 0, uma vulnerabilidade moderada preexistente, sem high/critical.
- Instalação congelada offline aprovada após atualizar apenas o vínculo workspace. Inspeção final: zero roles batch_runtime, lotes e eventos remanescentes no banco de teste. Cluster iniciado nesta etapa encerrado após verificações. Jornada Chrome/Keycloak não repetida localmente; conferir CI.
- Formato, diff e validador documental aprovados: 96 Markdown e 16 skills.

## Limites e revisão

API não expõe POST/GET do lote. INTAKE-02 a INTAKE-10 têm evidência de persistência/autorização, mas seus status HTTP e a integração pelo Bearer real permanecem pendentes. INTAKE-11 e privacidade do novo transporte exigem a próxima etapa. DB-03 de tabelas de controle não foi resolvido; SQL arbitrário com setting mutável continua fora da defesa.

Revisão local: SQL parametrizado, scopes canônicos, separação de adapters, permissões/constraints, comparação sem arredondamento, descarte de conexão e rollback aditivo. Sem achado bloqueante local; não é revisão independente. Conferir versão PostgreSQL, checks externos e revisão remota pelo head entregue. Revisão humana de isolamento antes de merge; nenhum deploy ou migration em banco existente de produto foi executado.
