# Validação da consulta de memberships

Escopo autorizado no [ADR 0008](../adr/0008-membership-directory.md): resolução de ator e consultas autenticadas de organizações/membership. Entrega em branch própria após PR #8, sem deploy ou merge automático.

Implementados: Actor único por issuer/subject, Organization/Membership com constraints, adapters parametrizados, paginação limitada e endpoints de lista/contexto com Bearer. Header de tenant e role do token não concedem acesso; vínculo ausente/revogado e organização inexistente retornam o mesmo 403. Identidade não provisionada recebe lista vazia sem criação automática. Erros indisponíveis são 503 sanitizados e respostas usam no-store.

## TDD observado

- Serviço de aplicação: stub respondeu lista vazia/negou contexto; 5 falhas comportamentais e 3 negativos passaram. Implementação passou os 8 casos, incluindo paginação, vínculo ativo, role inválida e falha do diretório.
- Transporte: schemas inicialmente rejeitavam toda entrada; 3 casos positivos falharam e 1 negativo passou. Contratos estritos passaram após implementação. Casos adicionais verificam IDs, seletores e representação OpenAPI. A revisão encontrou o nome não vazio validado em runtime, mas sem pattern no OpenAPI; um teste falhou pela ausência e a troca por regex serializável corrigiu o contrato. Demais casos adicionais não foram escritos antes do código.
- HTTP: 12 testes falharam com 404 antes das rotas; após composição/controller, os 12 passaram. Teste posterior compara OpenAPI, Bearer, schemas de sucesso/erro e limites.
- Persistência, ciclo de vida e integração do processo compilado foram testados depois da implementação; não são apresentados como TDD retroativo. Uma asserção de código específico de FK foi corrigida para classe de integridade e permanência do ator, preservando a restrição. Cobertura de transporte inicialmente ficou em 79,31% de statements; testes de fronteiras/OpenAPI completaram o exercício, sem reduzir metas.

## Verificações locais — 08/10/2026

Ambiente: Node 24.21.0, pnpm 10.24.0, PostgreSQL 18.1 em cluster isolado e Chrome 152/Cypress 16.1.1. Sem engine Docker local. CI usa PostgreSQL 17 e executa separadamente a jornada real Keycloak.

| Comando                                 | Evidência                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm install --frozen-lockfile          | Lockfile preservado; nenhuma dependência adicionada                                                                                                                                                  |
| pnpm lint / pnpm typecheck / pnpm build | Aprovados no workspace                                                                                                                                                                               |
| pnpm test:coverage                      | 160 testes passaram: API 88, contracts 18, web 23 e BFF 31; módulo de organizações com 100% de linhas/branches/funções/statements                                                                    |
| pnpm test:integration                   | 16 testes PostgreSQL passaram; migrations idempotentes, FKs, unicidade, role limitada, paginação e revogação                                                                                         |
| pnpm test:integration:membership        | API compilada + RSA efêmero + conexão de runtime de leitura: paginação, identidade não provisionada, role do token ignorada, tentativa cruzada, revogação com token válido e 503 sanitizado passaram |
| pnpm test:smoke                         | OTLP real e autenticação da API passaram                                                                                                                                                             |
| pnpm test:e2e                           | 2 jornadas operacionais passaram em Chrome; não são E2E de memberships                                                                                                                               |
| pnpm audit:dependencies                 | Sem achados altos/críticos; 1 moderado em sprintf-js, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c); dependências desta entrega não foram alteradas                       |

Conexão PostgreSQL do runtime é distinta da credencial do migrador, sem ownership, superuser ou BYPASSRLS; UPDATE/INSERT e acesso a auth_bff foram negados. Fixtures, senhas e chaves são efêmeras, com remoção apenas dos registros/roles criados pelo teste. Os scripts exigem TEST_DATABASE_URL terminado em _test e não usam DATABASE_URL como fallback.

Formato e diff passaram em `pnpm format:check` e `git diff --check`; validador documental aprovou 70 arquivos Markdown e 16 manifestos de skills. URLs externas e anchors não são verificados pelo validador.

Autorrevisão do diff por segurança, contratos e camadas, sem revisão independente ou aprovação humana presumidas. Conferidos: autenticação antes de seleção, identidade exata, filtro por ator/vínculo ativo, ausência de autoelevação e dados privados em respostas/logs, queries parametrizadas, grants de leitura e migration aditiva. Revisão externa e CI remotos serão consultados no PR; não inferir aprovação a partir de existência de workflow ou bot.

RLS, administração com auditoria/locks e seleção BFF/UI não pertencem a esta entrega. Nenhuma evidência desta etapa demonstra isolamento de dados de negócio ainda inexistentes.
