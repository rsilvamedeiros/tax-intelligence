# ADR 0008 — Consulta de organizações e memberships

Status: decisão da etapa de desenvolvimento autorizada pelo mantenedor após PR #8. Implementação e evidências serão registradas na [validação](../engineering/membership-validation.md). Sem autorização para deploy ou provisionamento de dados reais.

## Escopo e limites

Identity and Access possui Actor, identificado pela dupla exata issuer/subject verificada pela API. Organizations and Tenancy possui Organization e Membership. Login não cria Actor nem associação automaticamente; e-mail, roles do token e headers de tenant não concedem acesso. Identidades de issuers distintos com o mesmo subject são atores distintos.

Esta entrega consulta vínculos ativos. Roles aceitas: organization_admin, analyst, reviewer e viewer. Role é metadado da associação; não libera operações de negócio ainda inexistentes. Revoked_at não nulo exclui a membership imediatamente das próximas consultas, sem cache de autorização. Uma consulta já iniciada pode concluir conforme seu snapshot; locks para operações com efeitos, administração/auditoria de associações e RLS de dados tenant-owned permanecem etapas posteriores da [RFC 0001](../rfc/0001-identity-membership-isolation.md).

## Contrato antes do código

| Rota                                          | Resposta 200                                          | Negativos e limites                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /v1/organizations                         | {items: [{id, name, role}], nextCursor: UUID ou null} | Somente vínculos ativos do ator. Limit padrão 25, inteiro decimal de 1 a 100; cursor UUID, ordenação por UUID. Query desconhecida: 400. Ator não provisionado: lista vazia. |
| GET /v1/organizations/:organizationId/context | {organization: {id, name}, role}                      | UUID válido; sem query. Associação ausente/revogada ou organização inexistente: mesmo 403, sem enumeração.                                                                  |

Bearer ausente/inválido: 401 e WWW-Authenticate Bearer, antes de validar seleção. Verificação/lookup indisponível: 503 sanitizado. Mesmo contrato de erro correlacionado da API e no-store. Respostas não incluem actorId, issuer, subject, token, e-mail ou memberships de terceiros. Schemas runtime e OpenAPI devem concordar. Seleção é intenção; cada requisição verifica vínculo novamente.

## Persistência e provisionamento

Migration aditiva cria identity_access.actors, organization_access.organizations e organization_access.memberships. Identidade única por issuer/subject; membership única por organization/actor; FKs restritivas, role limitada e nome de organização não vazio. Índice de vínculos ativos por actor/organization atende paginação. Nenhuma migration anterior é editada.

Adapters SQL parametrizados separados para resolução de Actor e consulta de Membership. API compõe os adapters; aplicação define portas e domínio permanece independente de Nest/ORM/transporte. Não criar query genérica nem compartilhar tabelas privadas entre contextos.

Role runtime precisa apenas de USAGE nos dois schemas e SELECT nessas três tabelas; sem ownership, superuser, BYPASSRLS ou grants de escrita. Migration não cria usuários globais nem concede privilégios a PUBLIC. Provisionamento fica com uma credencial operacional separada; fixtures são exclusivamente sintéticas em TEST_DATABASE_URL terminado em _test. A credencial BFF continua restrita ao schema auth_bff. [Privilégios PostgreSQL](https://www.postgresql.org/docs/17/ddl-priv.html).

## Aceite, riscos e rollback

Observar Red/Green de comportamento, não falha de import/conexão. Provar identidade por issuer, paginação, ator desconhecido, seleção B por ator A, membership revogada com token ainda válido, indisponibilidade, schemas estritos e ausência de dados sensíveis em logs. PostgreSQL real prova constraints, role sem escrita e adapters; processo compilado com token RSA efêmero prova a integração HTTP/SQL.

Consulta SQL arbitrária com a credencial runtime não é isolamento RLS; os adapters aplicam o escopo. Não chamar esta entrega de conclusão de DB-01 a DB-06 ou E2E-01. Administração exige auditoria transacional e locks antes de efeitos de domínio; seleção no navegador exige próxima etapa BFF/UI. Revisão humana de segurança permanece necessária antes de produção.

Rollback de aplicação desabilita as novas rotas e mantém a migration aditiva. Preservar atores, associações e sessões; não remover schemas/volumes para contornar falhas.
