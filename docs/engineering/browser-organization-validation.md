# Validação da seleção de organização

Escopo e aceite no [ADR 0009](../adr/0009-browser-organization-selection.md), após integração do PR #9. Documentação e AGENTS precederam implementação e foram versionados em commits separados. Sem migration ou dependência nova; nenhuma ampliação de acesso ao banco pela web.

## Comportamento e TDD

BFF consulta lista/contexto usando somente token da sessão técnica. Rejeita cookies duplicados, host inesperado, seletores/query inválidos, respostas fora do schema e contexto de outra organização. Não encaminha Authorization ou tenant do navegador, não segue redirects e sanitiza indisponibilidade. Token não é retornado. React representa loading, vazio, paginação, retry e seleção negada. Seleção só aparece após context validado; atualizar, foco/visibilidade, mudar página, substituir sessão e iniciar logout limpam dados e cancelam requisições antigas.

- BFF: stub devolvia 503; 7 testes falharam pelos comportamentos ausentes e 3 negativos passaram. Implementação passou os 10. Posteriormente, teste de contexto com ID diferente falhou com 200 e passou após validação; negativos adicionais/paginação ampliaram a suíte para 12.
- React: stub mostrava apenas loading; 9 testes falharam pela ausência da jornada e 1 passou. Implementação passou os 10 após corrigir duas asserções de teste: esperar o texto de seleção concluída e usar o resultado de axe, sem matcher não instalado. Casos posteriores verificam retorno de página, erro de contexto, cancelamento, sessão substituída e logout. Não apresentar casos posteriores como TDD retroativo.
- Reader de sessão, composição e fixtures de navegador foram verificados após implementação. A tarefa de revogação roda apenas no Node de testes, delegando ao runner em scripts; exige TEST_DATABASE_URL terminado em _test e allowlist de UUIDs gerados nesta execução. Não existe endpoint de teste/administração na aplicação.

## Verificações locais — 08/10/2026

Node 24.21.0, pnpm 10.24.0, PostgreSQL 18.1, Chrome 152/Cypress 16.1.1 e Keycloak 26.8.0 com JVM 21 em armazenamento local isolado. O launcher portátil teve inicialmente erro de quoting/caminho H2 no Windows; corrigido somente em ferramentas ignoradas, sem mudança de configuração de produto. Import do realm foi comparado ao arquivo do repositório. Senhas/chaves são efêmeras e não publicadas.

| Check                                                    | Resultado efetivamente executado                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm lint / pnpm typecheck / pnpm build                  | Aprovados                                                                                                                                                              |
| pnpm test:coverage                                       | 189 testes: API 88, contracts 18, web 38 e server/BFF 45; metas preservadas                                                                                            |
| pnpm test:e2e:auth                                       | 1 jornada Chrome real passou: login por code/PKCE, A selecionada, B negada, revogação após listagem negada, CSRF e logout; GET de organizações retorna 401 após logout |
| node scripts/smoke-identity-provider.mjs                 | Realm, issuer, PKCE e chaves RSA passaram                                                                                                                              |
| pnpm test:integration / pnpm test:integration:membership | 16 testes PostgreSQL e integração da API compilada com RSA e role de leitura aprovados                                                                                 |
| pnpm test:smoke / pnpm test:e2e                          | Smoke de autenticação/telemetria e 2 jornadas Chrome da fundação aprovados                                                                                             |
| pnpm install --frozen-lockfile / pnpm audit:dependencies | Lockfile preservado; nenhum alerta alto/crítico; 1 moderado preexistente em tooling Jest                                                                               |

A jornada usa credencial operacional somente para fixtures; API possui SELECT em identidade/organizações, e BFF somente acesso às sessões técnicas. Ambas as roles são não proprietárias, sem superuser/BYPASSRLS. IDs das fixtures chegam ao Cypress; URLs de banco e credenciais de runtime não. Fixtures e roles removidas pelo runner.

Autorrevisão de segurança e camadas: token só no servidor, rota upstream fixa, sessão lida por porta, schemas estritos, nenhuma seleção persistida como grant, dados anteriores limpos e respostas canceladas. Revisão externa e resultados de CI serão consultados no PR; não presumir aprovação humana ou revisão independente. RLS, administração/auditoria/locks e E2E-01 com ação de negócio continuam pendentes.
