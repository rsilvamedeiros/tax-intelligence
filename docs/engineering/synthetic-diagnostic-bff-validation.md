# Validação do BFF de diagnóstico sintético

Etapa do [ADR 0026](../adr/0026-synthetic-diagnostic-bff.md), em 23/10/2026, após integração da PR #30 (`e28d0a7`). POST/GET pela sessão existente, sem UI ou SQL de domínio na web. Rotas Node e runtime de autenticação compõem somente sessão e transporte; API conserva autorização e aritmética.

## TDD e fronteiras

Dois ciclos Red/Green observados: stub retornava 503 em vez de criar com 201; após handler pela sessão, passou. Em seguida, recibo JSON válido com mais de 32 KiB era aceito com 201 em vez de 503; após leitura limitada e cancelamento, passou. Demais negativos são regressões, sem alegar Reds individuais. Typecheck identificou união de objetos com header opcional inferido como undefined no teste parametrizado; tabela convertida em pares nome/valor, sem any, e checagem repetida com sucesso. Essa falha de tipagem não é Red comportamental.

72 testes novos usam Request/Response/ReadableStream reais e dublês apenas de sessão/upstream. Cobrem credencial exclusiva da sessão, Host/Origin/método, CSRF, sessão antes de seletores, UUID/query/campos extras, Idempotency-Key proibida, UTF-8/mídia/compressão, limite exato/excesso/stream com Content-Length enganoso, cancelamento, GET sem corpo/framing, 201/200, schemas fechados e erro sanitizado sem retry/cookies/redirects. Não recalculam evidência no BFF nem simulam isolamento PostgreSQL.

## Evidências locais

- Node 24.21.0, pnpm 10.24.0; sem dependências ou migrations novas.
- `pnpm exec turbo test:coverage --concurrency=1`: 874 testes aprovados (154 contracts, 363 API, 122 web e 235 BFF), incluindo 72 novos. Metas mantidas; runtime de composição continua coberto pela jornada compilada, excluído da cobertura unitária conforme configuração existente.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` e `pnpm test:smoke` aprovados. Build registra as duas rotas de diagnóstico; smokes existentes de autenticação/OTLP não equivalem a prova específica de traces do diagnóstico.
- `pnpm audit:dependencies`: código zero, nenhuma vulnerabilidade conhecida retornada nesta execução; histórico de alertas anteriores não substitui o resultado atual.
- `pnpm test:integration`: 144 testes/dez suítes em PostgreSQL 18.1 isolado. Verificação adicional executou a fixture compartilhada de navegador com novo login exclusivo autenticado: store/serviço reais criaram e repetiram a execução, cleanup removeu resultados/eventos/roles próprios. Essa composição não é browser nem autenticação OIDC.
- Jornada Keycloak/Chrome local não executada: Docker e Java não foram encontrados no PATH. CI de identity-provider foi estendido para provar login real → lote → BFF de diagnóstico → replay/evidência → negação de tenant/CSRF → viewer consulta e não recebe replay → logout nega operações. Login de diagnóstico restrito separado de controle, lote e sessão; somente TEST_DATABASE_URL `_test`. Cleanup inclui as duas relações novas antes de excluir o lote e seus vínculos.

Links de 114 documentos/16 manifests aprovados; diff sem erros de whitespace. Formato inicialmente identificou as duas rotas novas, corrigidas pelo formatter antes da repetição. Cleanup confirmou ausência de roles descartáveis (incluindo navegador), lotes, execuções, eventos e funções de falha; cluster iniciado nesta etapa encerrado. Resultados remotos e revisão externa registrados abaixo.

Autorrevisão de sessão/transporte, cancelamento, credenciais e grants de fixture sem achado bloqueante identificado. Autorrevisão não equivale à revisão externa ou aceite humano de segurança. Não publicar aprovação automática de isolamento.

## CI e revisão externa

PR #31 aberta em main, fora de draft, sem merge automático. Em e21395f, [CI](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39955412194) aprovou 144 testes/dez suítes PostgreSQL 17.11 e jornadas compiladas existentes de lote/serviço/API. Os oito checks, incluindo GitGuardian, passaram nesse head. Identity-provider passou com Cypress 16.1.1, Chrome 155 headless e `authentication.cy.ts` (um teste composto): o helper de diagnóstico criado nesta entrega foi executado na sessão real, incluindo criação/replay/detalhe, CSRF/tenant negados, viewer read/write denial e operações negadas após logout. Execução local sem browser não foi reclassificada como E2E.

CodeRabbit não iniciou revisão automática pela política do serviço para repositório com menos de dez estrelas; revisão completa foi solicitada manualmente. Seu status verde inicial não equivalia a review produzido. Review 5628454190 concluído em e21395f, abrangendo 20 arquivos: dois achados menores documentais em AGENTS e arquitetura, sem achado de código/segurança publicado. Complemento corrige etapas antigas apresentadas como próximas, restringe pendências à interface/regras reais e registra a prova do CI. Não alegar revisão externa do commit documental posterior; aceite humano permanece necessário.

## Limites e próximo ponto de decisão

Sem acesso SQL de domínio na web, nova permissão ou configuração de produção. RLS continua somente nas seis relações sintéticas. Não há componente de diagnóstico ou cálculo no React, regra tributária real, deploy ou merge automático. Resultado demonstrativo mantém origem de fixture e validade fiscal inexistente.

Próximo módulo: interface de diagnóstico para lote conhecido, criação/replay/consulta e recuperação explícita após efeito incerto; exige ADR/TDD próprios. Prova OTLP específica, fontes reais e produção permanecem posteriores. A primeira vertical ainda não está concluída pela simples existência das rotas.
