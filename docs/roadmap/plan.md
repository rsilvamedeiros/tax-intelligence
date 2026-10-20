# Roadmap e backlog priorizado

Atualização do [ADR 0018](../adr/0018-synthetic-document-persistence.md): persistência e autorização transacional do lote sintético implementadas, incluindo RLS nas novas tabelas e auditoria atômica. [Evidências](../engineering/synthetic-document-persistence-validation.md). Próximo módulo: pool dedicado na composição da API e POST/GET com negativos HTTP. Interface, diagnóstico e dados reais continuam posteriores.

Etapa anterior: [ADR 0017](../adr/0017-synthetic-document-contract.md), contrato runtime/OpenAPI e comando canônico do lote sintético implementados após a PR #20. [Evidências](../engineering/synthetic-document-contract-validation.md). A persistência foi implementada na etapa atual do ADR 0018; rotas, diagnóstico e interface continuam posteriores. Entradas abaixo preservam o percurso anterior.

BFF administrativo implementado conforme [ADR 0014](../adr/0014-administrative-membership-bff.md), com token server-side, Origin/CSRF e autorização revalidada pela API. Interface administrativa implementada no [ADR 0015](../adr/0015-administrative-membership-ui.md), sem ampliar acesso SQL do web. [Validação](../engineering/administrative-membership-ui-validation.md). RLS, criação de identidade e reativação permanecem pendentes.

Sem datas prometidas; cada etapa depende do aceite da anterior. [Plano da inspeção](../engineering/repository-assessment.md).

Etapa técnica atual: [prova sintética RLS](../adr/0016-synthetic-rls-proof.md) implementada com [12 cenários aprovados localmente](../engineering/synthetic-rls-validation.md), integração aprovada em PostgreSQL 17.11 no CI e revisão CodeRabbit concluída, com correção documental; integrada na PR #19. Prova isolada não habilita RLS na aplicação nem autoriza domínio fiscal. O próximo consumidor real exige recorte autorizado e critérios próprios; acompanhar [status do projeto](../engineering/project-status.md).

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

Pendências para negócio: marca, ICP de clientes, regras e fontes reais, responsável tributário, identity provider de produção, política de retenção, hospedagem/orçamento e operação. Keycloak de desenvolvimento e a fronteira de tokens da API estão definidos no [ADR 0006](../adr/0006-development-identity-provider.md). Nenhuma dessas pendências impede revisar documentação; algumas bloqueiam piloto com dados reais.

Consulta administrativa de membros completa a preparação da API para UI administrativa no navegador conforme [ADR 0013](../adr/0013-administrative-membership-directory.md). UI implementada no ADR 0015; RLS ainda requer etapa própria.

Após a fundação, RFC/threat model e matriz de TDD orientaram autenticação da API, login/sessões BFF, consulta/seleção de organizações e revogação administrativa com auditoria/locks, conforme ADRs 0006–0010. Alteração de papéis existentes foi implementada no [ADR 0011](../adr/0011-membership-role-changes.md). Concessão a atores existentes foi implementada no [ADR 0012](../adr/0012-membership-grants.md), sem reativação ou criação de identidade. Próximas etapas devem completar isolamento RLS antes de importação fiscal; cada módulo exige seu contrato, negativos e aceite. [RFC 0001](../rfc/0001-identity-membership-isolation.md), [ameaças](../security/identity-tenancy-threat-model.md), [matriz de TDD](../engineering/identity-tenancy-test-plan.md). A vertical fiscal não foi autorizada por essas entregas de identidade/acesso.

Próximo recorte em revisão: [primeiro lote sintético](../rfc/0003-synthetic-document-intake.md), somente API de criação/consulta, idempotência e auditoria/RLS em novas tabelas. Contrato e testes propostos precedem autorização de implementação; diagnóstico e UI são posteriores.
