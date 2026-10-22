# ADR 0024 — Persistência da execução sintética

Data: 22/10/2026. Status: próximo módulo solicitado após entrega dos casos de uso. PRs #27/#28 abertas no início; branch dependente, sem merge automático. Autoriza migration aditiva e adapters injetados, testes PostgreSQL isolados e composição com o caso de uso existente. Sem variável de runtime, endpoint, BFF/UI, dados fiscais reais ou deploy.

## Modelo e fronteiras

Migration 0007 cria tax_intelligence.synthetic_diagnostic_runs e audit_compliance.synthetic_diagnostic_creations. Tenant obrigatório, PK/FKs compostas para lote/membership e evento/execução/ator, unicidade tenant/lote/regra/versão e um evento por execução. Resultado JSONB normalizado, schema/versão fixos, CHECK de objeto e 16 KiB em representação textual UTF8; aritmética validada no caso de uso, nunca movida a database. Dados/eventos imutáveis para o login da aplicação. Novas relações com ENABLE/FORCE RLS e policies de SELECT/INSERT conforme responsabilidade; sem GRANT a PUBLIC, CREATE ROLE ou provisionamento no runtime.

Fiscal expõe SyntheticBatchSnapshotStore na mesma conexão e scope autorizado; extrair a leitura existente sem alterar seu contrato/validações. SyntheticDiagnosticExecutionStore implementa estruturalmente a porta do ADR 0023, sem importar apps/api: readBatch delega a Fiscal, recordCreation delega a Audit, demais capacidades pertencem a Tax Intelligence. Composição injeta o store no serviço; domínio/application não conhecem SQL/PoolClient. Capacidade retida após callback/commit/rollback é invalidada.

## Autorização, perfil e prazo

Reutilizar OrganizationOperationStore: precheck antes do lock e revalidação após espera; create exige administrador/analista, read admite quatro papéis ativos. Tenant local definido só após autorização e filtro explícito em cada query. Replay também revalida, preserva recibo/iniciador/requestId originais e não duplica evento. Application verifica evidência pelo snapshot; falha de auditoria ou integridade reverte a transação inteira.

Pool injetado deve ter connectionTimeoutMillis entre 1 e 2000 ms e statement_timeout entre 1 e 2000 ms. Transação READ COMMITTED com lock_timeout 1500 ms, statement_timeout 2000 ms e transaction_timeout 5000 ms (PostgreSQL 17+). Prazo monotônico total de 10000 ms desde tentativa de aquisição, incluindo perfil e callback; ao expirar, invalidar capacidades e destruir somente a conexão alugada, provocando rollback no servidor. Operações assíncronas são rastreadas: callback que deixa operação sem await não confirma e descarta conexão. Exigir um evento por execução inserida antes de confirmar; conferir resposta COMMIT do servidor, sem aceitar ROLLBACK como sucesso. Em erro comum, ROLLBACK; falha de rollback/contaminação/erro de conexão descarta cliente e preserva erro original. Não deixar callback tardio usar conexão devolvida ao pool.

Login real de teste exclusivo, NOINHERIT e sem superuser/BYPASSRLS/membership de roles/DDL/sequences/auth_bff/ownership. SELECT de controle (atores/memberships) e três tabelas fiscais, SELECT/INSERT de execução, INSERT apenas tenant_id/actor_id/execution_id/request_id do evento. Nenhuma escrita fiscal/controle ou leitura/mutação de auditoria. Perfil efetivo, RLS e UTF8 verificados por operação na conexão alugada; perfil excessivo falha fechado. Login de migration separado; runtime não concede privilégios. Credenciais e nova configuração da API ficam para etapa HTTP posterior.

## Plano, aceite e reversão

Documentação → Red de capacidade de execução ausente em PostgreSQL válido → Green de execução/evento → Red de replay com duplicação → Green; regressões de matriz de papéis, A/B, RLS sem filtro, unicidade/FKs, tamanho JSONB, privilégio mínimo, falha de evento/integridade, contaminação/recuperação e revogação/rebaixamento coordenados por locks observados. Não contar falhas de migration/fixture como Red. Compor serviço real com store em jornada isolada; mocks não aprovam persistência. Testes usam TEST_DATABASE_URL `_test`, roles descartáveis e cleanup de IDs próprios.

Executar integração completa, cobertura/lint/tipos/build/smokes, links/formato e revisão. Novo SQL testado apenas em cluster isolado; nenhuma aplicação em banco existente do usuário. RLS passa de quatro para seis relações sintéticas, sem resolver DB-03 de controle ou dados reais. Reversão desabilita futuro consumidor e revoga somente seus grants, preservando migration/dados/eventos/RLS. Segurança e aceite humano permanecem necessários antes de merge; primeira vertical ainda requer transporte e interface do diagnóstico.
