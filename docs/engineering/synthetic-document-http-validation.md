# Validação da API de lote sintético

Data: 20/10/2026. Escopo do [ADR 0019](../adr/0019-synthetic-document-http.md), dependente da PR #22. Dados exclusivamente sintéticos; sem deploy ou alterações de grants em banco existente de produto.

## Comportamento e TDD

Primeiro Red: aplicação Nest real retornou 404 no POST ausente, quando o teste esperava 503 por storage não configurado. Green: composição registrada e negação segura sem fallback. Segundo Red: URL com `%72untime` permitiu reutilizar o login administrativo `runtime`; um teste falhou e dez passaram. Green: comparação de usernames decodificados, onze testes passaram. Os demais casos são regressões adicionadas durante a entrega, sem afirmar Red individual.

38 testes HTTP e 11 de composição: criação 201, replay 200, recibo/detalhe estritos, Bearer antes da validação do controller, campos extras/queries/UUIDs, chave ausente/duplicada/inválida, erros sanitizados, no-store e OpenAPI. Corpo exatamente 16 KiB é aceito; excesso, inclusive chunked real, retorna 413; mídia e compressão não permitidas retornam 415; GET rejeita corpo. Autenticação e persistência são substituídas somente nas fronteiras desses testes.

Dois testes PostgreSQL adicionais verificam perfil restrito versus owner e exigência de INSERT independentemente de SELECT. O runner compilado usa processo Node real, RSA/JWKS local, migrations e role aleatória não privilegiada no TEST_DATABASE_URL isolado. Exercita criação/replay/conflito, papéis persistidos apesar de claim administrativo, revogação, 404 uniforme entre organizações, evento único, seis grants excessivos rejeitados e recuperação após revogá-los. Lock real de auditoria provoca 503 sem agregado parcial; operação seguinte recupera. Fixtures e grants são removidos por IDs/role próprios.

O primeiro smoke compilado expôs ausência da dependência direta `express`, mascarada pela resolução Jest. Declaração corrigida na versão 5.2.1 já transitiva; lockfile adiciona somente o vínculo direto, sem atualizar versões externas. Falha de importação e ajuste do harness chunked não contam como Red comportamental.

## Execução local

Node 24.21.0, pnpm 10.24.0 e PostgreSQL 18.1 em cluster de testes próprio. Banco e runner usam apenas TEST_DATABASE_URL; API filha recebe exclusivamente a URL do login restrito para o lote, com DATABASE_URL/BFF_DATABASE_URL vazias. Nenhum segredo é versionado.

- `pnpm test:coverage`: suítes de contracts, API, componentes web e BFF aprovadas; após regressões finais, API reexecutada com 232 testes. Total combinado: 473 testes, cobertura acima dos thresholds existentes.
- `pnpm test:integration`: 108 testes PostgreSQL em nove suítes, incluindo os dois novos cenários de perfil.
- `pnpm test:integration:synthetic-batch`: jornada compilada descrita acima aprovada.
- `pnpm test:integration:membership`: regressão compilada administrativa aprovada.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` e compilação TypeScript explícita dos novos specs: aprovados.
- `pnpm test:smoke`: RSA/autenticação e exportação OTLP reais aprovadas, sem sentinelas sensíveis.
- `pnpm audit:dependencies`: exit 0, um advisory moderado; nenhum alto/crítico reportado.
- `node scripts/validate-docs.mjs` e `pnpm format:check`: aprovados, com 98 documentos Markdown e 16 manifests de skills validados.
- CI e revisão externa devem ser confirmados no fechamento da PR; não inferir revisão executada apenas pelo commit status.

## Limites e operação

SYNTHETIC_BATCH_DATABASE_URL é opcional nesta fundação: ausente, operações retornam 503. A readiness existente continua descrevendo DATABASE_URL; não comprova disponibilidade do pool do lote. URLs inválidas/reutilização de login falham na composição; privilégio inseguro ou indisponibilidade falham em cada operação. Nenhum provisionamento automático. Antes de produção, definir readiness agregada, credenciais/rotação e aceite operacional em etapa própria.

O perfil verifica flags/memberships, ownership, CREATE de schema/banco, acesso a sequências, RLS habilitado/forçado nas quatro tabelas, leitura/escrita de tabelas/colunas e acesso auth_bff. Não é auditoria completa de funções SECURITY DEFINER, políticas alteradas por owner ou processo com SQL arbitrário comprometido. Há consulta de catálogo por operação; medir antes de otimizar. Privilégios podem mudar depois da checagem; grants de produção permanecem responsabilidade operacional.

Sem migration nova, BFF/UI do lote, diagnóstico, cálculo tributário, conectores reais ou deploy. Chrome/Keycloak não foram reexecutados localmente nesta entrega; regressões de navegador ficam a cargo dos jobs existentes do CI. Revisão local é autorrevisão; revisão humana de autorização/isolamento continua necessária antes de merge.
