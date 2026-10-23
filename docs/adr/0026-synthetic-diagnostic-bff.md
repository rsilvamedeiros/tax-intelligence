# ADR 0026 — BFF do diagnóstico sintético

Data: 23/10/2026. Status: próximo módulo solicitado após integração da PR #30. Autoriza criação/replay/consulta pela sessão BFF existente. Sem interface visual, novas permissões, SQL de domínio na web, dados reais, deploy ou merge automático.

## Contrato e segurança

POST `/api/organizations/:organizationId/synthetic-diagnostic-executions` recebe somente JSON UTF-8 `{batchId}`, até 1024 bytes efetivamente lidos do stream, sem compressão, query ou Idempotency-Key. Host deve coincidir com a origem configurada, sem confiar em forwarded headers; Origin exata e x-csrf-token de 43 caracteres base64url comparado em tempo constante à sessão são obrigatórios na escrita. GET da mesma rota com `/:executionId` não aceita corpo/framing ou query e não exige CSRF. Sessão é validada antes de seletores/corpo, exceto host/origin/método; ausência/expiração retorna 401.

Bearer vem exclusivamente da sessão server-side. Authorization, cookies, tenant, role e request ID fornecidos pelo navegador não são encaminhados. Path fixo com UUIDs validados; API revalida membership e ação. Administrador/analista cria/replay; quatro papéis ativos consultam conforme ADR 0025. Nenhuma ampliação da exceção SQL do runtime de autenticação.

Criação preserva 201 e replay 200; consulta preserva 200. Sucessos usam schemas fechados de recibo/detalhe, mídia JSON e limite de 32 KiB de resposta; excedente ou contrato inválido vira 503. Schema valida estrutura, não recalcula evidência no BFF. Erros conhecidos 400/401/403/404/413/415 são sanitizados; demais status/falhas viram 503. No-store/no-referrer em todas as respostas; sem headers/corpo privado upstream. Transporte existente usa timeout de 3 segundos, redirects proibidos e cache desabilitado; sem retry automático. Efeito incerto exige repetir o mesmo batchId ou consultar ID conhecido: unicidade natural é garantida na API, sem chave nova por tentativa.

## Plano, riscos e aceite

Documentação → stub válido → Red de criação com sessão → Green mínimo → Red de resposta acima do limite → Green com leitura limitada → negativos/regressões. Mocks somente de sessão/transporte, usando Request/Response/streams reais. Cobrir Host/Origin/CSRF, método, sessão, campos/query/UUIDs, bytes exatos/excesso/UTF-8, mídia/compressão, GET sem corpo, schemas, status/replay e cancelamento. Risco principal: encaminhar credencial do navegador ou operação sem CSRF; negativos bloqueiam a entrega.

Estender jornada compilada de Keycloak/Chrome/PostgreSQL isolado: lote existente → criação/replay/detalhe pelo BFF → CSRF inválido → tenant externo → consulta por viewer e negação de replay → sessão revogada. Login de diagnóstico real é dedicado e restrito, separado do lote, controle e sessão; fixtures/roles/eventos limpados por IDs próprios. TEST_DATABASE_URL `_test` exclusivamente. CI de navegador prova o runtime; mocks não aprovam sessão ou isolamento SQL.

Checks de cobertura/lint/tipos/build/smokes/formato/links e revisão obrigatórios. Registrar ambiente indisponível sem alegar execução local de navegador. Revisão humana antes do merge. Reversão remove consumidor/rotas BFF e preserva resultado/eventos/RLS da API. Interface de diagnóstico e prova OTLP específica permanecem etapas posteriores.
