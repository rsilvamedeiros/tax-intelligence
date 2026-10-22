# ADR 0025 — API da execução sintética

Data: 22/10/2026. Status: próximo módulo solicitado pelo mantenedor, dependente da persistência da PR #29. Autoriza composição HTTP dos casos de uso do ADR 0023 com o adapter do ADR 0024. Sem merge automático, BFF/UI, dados reais ou deploy.

## Contrato e limites

POST `/v1/organizations/:organizationId/synthetic-diagnostic-executions` aceita somente JSON `{batchId}` (UUID canônico), até 1024 bytes inclusive chunked, sem compressão, query ou Idempotency-Key. Identidade vem exclusivamente do Bearer verificado; requestId vem do middleware. Regra e versão permanecem fixas no serviço. Administrador/analista ativo cria e recebe replay: 201 ou 200 com recibo estrito. Repetir o mesmo lote usa a unicidade natural tenant/lote/regra/versão, inclusive após efeito incerto; não gerar chave por tentativa. Quatro papéis ativos podem consultar GET da mesma rota com `/:executionId`, sem corpo/query. Resposta 200 com detalhe estrito e evidência sintética, sem validade fiscal.

401 com WWW-Authenticate; 400 entrada inválida; 403 sem permissão; 404 uniforme para recurso ausente/externo após autorização; 413 excesso; 415 mídia/compressão; 503 storage/configuração/integridade indisponíveis. Erros sanitizados, request ID e no-store seguem a infraestrutura existente. Parser pode rejeitar JSON antes do Bearer; controller autentica antes da validação de seletores. OpenAPI e schemas runtime evoluem juntos. Nenhuma nova permissão ou migration.

## Composição e segurança

Módulo Nest exclusivo: controller → serviço de application → unidade de trabalho implementada por repository que injeta o store público. `SYNTHETIC_DIAGNOSTIC_DATABASE_URL` é opcional no bootstrap; ausência não usa outro pool e operações retornam 503 após autenticação/validação. URL inválida ou username compartilhado com DATABASE_URL, BFF_DATABASE_URL ou SYNTHETIC_BATCH_DATABASE_URL falha na inicialização, sem imprimir URL. Pool próprio é encerrado no shutdown; perfil/grants/RLS são conferidos pelo store em cada conexão antes da operação. Configurar a variável não provisiona login/grants: operação real exige preparação e aceite próprios.

Sem SQL no controller/application, sem nova consulta SQL da web. Não confiar em header tenant, papel no token ou ator no payload. Telemetria existente registra templates de rota, status e request ID; não documentos, valores, JWT ou identidade externa. Prova OTLP específica e jornada de navegador continuam etapas posteriores.

## Plano, riscos e aceite

Documentação primeiro. Red de rota POST ausente em app válido → controller/módulo mínimo → Green; Red de composição ausente/compartilhada → repository mínimo → Green. Cobrir contrato, Bearer antes dos seletores, schemas fechados, status/replay, query/corpo inválidos, bytes/chunked/compressão, erros seguros e OpenAPI; dublês só no transporte/storage. Composição final com API compilada, JWKS/RSA temporários e PostgreSQL real via TEST_DATABASE_URL `_test`: login dedicado, concorrência/replay, autorização A/B/papéis, revogação, auditoria e falha de privilégios. Regressões existentes e checks obrigatórios. Não alegar isolamento a partir de mocks.

Risco principal: credencial excessiva ou replay sem autorização; usar perfil restrito do ADR 0024 e testes negativos bloqueantes. Rollback operacional desabilita consumidor/variável dedicada, preservando execuções/eventos e migrations. Nenhum provisionamento em instância do usuário, alteração remota de segurança ou deploy nesta entrega. Aprovação humana permanece obrigatória.
