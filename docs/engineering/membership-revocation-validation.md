# Validação da revogação de memberships

Escopo e aceite no [ADR 0010](../adr/0010-membership-revocation.md), após PR #10. Documentação e AGENTS foram versionados antes dos testes/implementação, em commits separados. API/persistência de controle de acesso; nenhuma interface administrativa, concessão de vínculos, policy RLS ou ação fiscal foi adicionada.

## Comportamento e Red/Green

- Serviço: stub lançava erro de capacidade ausente; 6 testes falharam por resultado/autorização/conflito incorretos. Implementação passou os 6; caso posterior de resposta inesperada do adapter aumentou a suíte para 7.
- HTTP: 11 testes falharam pela rota DELETE ausente (404 e OpenAPI sem operação), com serviço já Green. Rota/autorização/status/contrato passaram. Negativos de corpo adicionados depois encontraram text/plain aceito com 204; esse Red passou a 400 após rejeitar Content-Length não zero ou Transfer-Encoding. Null JSON já era rejeitado pelo parser. Suíte final: 13 casos.
- PostgreSQL real: migration/fixtures foram preparadas antes; stub retornava denied. 3 testes falharam por revogação/autorrevogação/rollback ausentes e 5 negativos passaram. Implementação passou os 8. Casos posteriores de concorrência, canonicalização, timeout e FKs ampliaram para 14; são verificações posteriores, não TDD retroativo.

Revogação e auditoria usam mesma transação/conexão. Runtime possui UPDATE somente de revoked_at e INSERT de auditoria; não possui ownership, superuser/BYPASSRLS ou acesso às sessões BFF. Evento possui iniciador/alvo vinculados à organização por FKs compostas, papel anterior, instante e requestId validado pelo middleware. Repetição/alvo ausente não grava evento novo; iniciador ainda precisa ser administrador ativo. Revogar o último administrador retorna conflito sem efeito.

Concorrência foi verificada com locks reais: pg_blocking_pids observa uma revogação esperando operação com FOR SHARE na membership; somente após liberar o lock a revogação confirma. Outro teste bloqueia no advisory lock, revoga o iniciador e comprova que a permissão é revalidada depois da espera. Revogações administrativas simultâneas preservam um administrador; revogações repetidas produzem um único evento. Não há sleep como prova de ordem. Lock_timeout aborta sem efeito, aceita UUID em caixa diferente para o mesmo lock e permite reutilizar o pool. Falta de INSERT de auditoria reverte revoked_at; restaurar o grant permite nova execução.

## Verificações locais — 09/10/2026

Node 24.21.0, pnpm 10.24.0, PostgreSQL 18.1 isolado, Chrome 152/Cypress 16.1.1 e Keycloak 26.8.0/JVM 21 local. Senhas e chaves efêmeras, dados sintéticos, TEST_DATABASE_URL obrigatória terminada em _test; nenhum fallback para banco de aplicação. Sem dependências novas ou edição de migrations anteriores.

| Check                                                    | Resultado executado                                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm lint / pnpm typecheck / pnpm build                  | Aprovados                                                                                                                                                                                                            |
| pnpm test:coverage                                       | 209 testes: API 108, contracts 18, web 38 e server/BFF 45; metas preservadas                                                                                                                                         |
| pnpm test:integration                                    | 30 testes PostgreSQL, incluindo 14 de revogação, aprovados                                                                                                                                                           |
| pnpm test:integration:membership                         | API compilada com JWT RSA efêmero e privilégios restritos: JWT admin ignorado, tenant alheio negado, 204 idempotente, token válido perde acesso, último administrador 409 e auditoria indisponível reverte alteração |
| pnpm test:smoke / pnpm test:e2e                          | Smokes de OTLP/autenticação e duas jornadas Chrome operacionais aprovados                                                                                                                                            |
| pnpm install --frozen-lockfile / pnpm audit:dependencies | Lockfile preservado; nenhum alerta alto/crítico, 1 moderado preexistente no tooling Jest                                                                                                                             |

`node scripts/smoke-identity-provider.mjs` e `pnpm test:e2e:auth` passaram com Keycloak real: uma jornada Chrome de login por code/PKCE, seleção, tentativa cruzada, revogação por fixture, CSRF e logout. É regressão do fluxo BFF/UI existente, não uma jornada administrativa. Formato e validador documental passaram: 74 Markdown, links internos e 16 skills.

Integração compilada começa com SELECT apenas para provar o diretório e depois acrescenta exatamente UPDATE(revoked_at)/INSERT de eventos para testar revogação. Fixtures e auditoria sintéticas são removidas pela credencial operacional. Logs/respostas verificados não contêm tokens, IDs de alvo, subject ou senha de runtime. Não há endpoint ou segredo de teste na aplicação.

Autorrevisão: autenticação antes de validar seletores, iniciador confiável, autorização dentro da transação, lock canônico, evento atômico, idempotência após autorização e erro sanitizado. CI e revisão externa serão conferidos no PR; não presumir revisão independente ou aprovação humana. Runtime comprometido com SQL arbitrário, proprietário/superuser e provisionamento que ignora o protocolo não são protegidos por esses controles. Operações fiscais, RLS, grants/troca de roles, consulta de auditoria e BFF/UI administrativos continuam pendentes.

Rollback de aplicação remove DELETE e grants adicionais; preservar migration e auditoria. Revisão humana de segurança permanece necessária antes de operação real.
