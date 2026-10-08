# Roadmap e backlog priorizado

Sem datas prometidas; cada etapa depende do aceite da anterior. [Plano da inspeção](../engineering/repository-assessment.md).

| Prioridade | Entrega                                           | Dependência/aceite                                                 |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| P0         | Documentação de produto/arquitetura e ADRs        | Revisão pelo responsável; propostas explícitas                     |
| P0         | AGENTS, skills, TDD e processo Git/PR             | Formato e links verificados; modo de confirmação definido          |
| P0         | Bootstrap reprodutível                            | Compatibilidade de dependências, lockfile, lint/tipos/testes/build |
| P0         | CI e observabilidade mínima                       | Jobs verificáveis; scan sem segredos; logs seguros                 |
| P1         | Provedor de identidade e threat model da vertical | Decisão OIDC e autorização de domínio                              |
| P1         | Organization/membership e isolamento              | Tests 401/403, escopo, FK composta e RLS real                      |
| P1         | Importação sintética e diagnóstico demonstrativo  | Idempotência, evidência, transação e auditoria                     |
| P1         | Consulta frontend e jornada E2E                   | Tenant B bloqueado; estados acessíveis                             |
| P2         | Piloto com entrevistas e casos representativos    | Métricas baseline e revisão especializada                          |
| P2         | Conector oficial escolhido                        | Autorização, credencial e homologação comprovadas                  |
| P3         | Worker/cache/analytics ampliado                   | Gargalo medido, não apenas previsão                                |

Pendências para negócio: marca, ICP de clientes, regras e fontes reais, responsável tributário, identity provider, política de retenção, hospedagem/orçamento e operação. Nenhuma dessas pendências impede revisar documentação; algumas bloqueiam piloto com dados reais.

Após a fundação e o padrão de PR dos PRs #1 a #4, a próxima entrega prepara [RFC 0001](../rfc/0001-identity-membership-isolation.md), [threat model](../security/identity-tenancy-threat-model.md) e [matriz de TDD](../engineering/identity-tenancy-test-plan.md). São propostas para revisão, sem autenticação/tenancy funcional. Próximo gate de implementação: provedor e contrato de sessão definidos, autorização específica e revisão dos negativos de segurança.
