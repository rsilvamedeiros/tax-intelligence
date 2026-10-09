# ADR 0011 — Alteração administrativa de papéis

Status: etapa de desenvolvimento autorizada após integração do PR #11. Organizations and Tenancy altera papéis de memberships existentes pela API. Sem concessão/reativação de vínculos, criação de atores, administração BFF/UI, RLS, dados reais ou operação fiscal.

## Contrato e invariantes

PATCH /v1/organizations/:organizationId/memberships/:actorId recebe exclusivamente JSON `{role}`. Vocabulário fechado existente: organization_admin, analyst, reviewer, viewer. Schemas runtime/OpenAPI compartilhados e estritos, IDs UUID e query vazia. Autenticação Bearer precede validação do controller; parse inválido pode ser rejeitado pelo middleware. Iniciador deriva de issuer/subject verificados. Role no token, tenant em header e propriedades adicionais não concedem permissão.

Somente administrador ativo na organização altera o papel. Iniciador ausente/revogado, viewer, organização alheia/inexistente: mesmo 403. Após autorização administrativa, alvo ausente ou revogado: mesmo 404, sem reativação. Alteração ou repetição do mesmo papel: 204 sem corpo, no-store. Não remover o último administrador ativo por rebaixamento: 409 sem efeito. Administrador pode alterar seu próprio papel se outro administrador ativo permanece. Promoção a administrador exige administrador existente; não há autoelevação. Falha de transação, lock ou auditoria: 503 sanitizado, contrato de erro correlacionado existente.

## Transação, migration e privilégios

Compartilhar o protocolo do ADR 0010: transação READ COMMITTED, advisory lock por UUID canônico da organização, locks no iniciador/alvo e permissão revalidada dentro da transação. Revogação e mudança de papel usam o mesmo lock, preservando o último administrador inclusive quando concorrem. Extrair somente o código transacional realmente comum; testes de revogação permanecem bloqueantes. Operações privilegiadas fora da API devem respeitar o protocolo; não há defesa contra SQL arbitrário comprometido.

UPDATE role e INSERT membership_role_changes confirmam juntos. Evento contém UUID, organização, iniciador/alvo, papéis anterior/novo, instante UTC e requestId validado pelo middleware; nenhum token, identidade externa ou nome/email. Repetição sem mudança não cria evento. Migration aditiva 0004 cria essa tabela com FKs compostas para memberships da mesma organização, vocabulário fechado e CHECK de papéis diferentes. Preservar tabela histórica de revogações e migrations anteriores.

Runtime recebe adicionalmente UPDATE(role) em memberships e INSERT no novo evento; nenhum INSERT/DELETE de memberships, escrita de identidade, ownership ou leitura/mutação de auditoria. BFF mantém somente acesso a sessões. Sem rota administrativa de navegador nesta entrega. Rollback desabilita PATCH e revoga grants adicionais, preservando eventos/migration.

## Aceite e TDD

Documentação primeiro. Observar Red comportamental e Green em contrato, aplicação/HTTP e PostgreSQL real: alterar/repetir, papéis inválidos/campos extras, iniciador confiável, viewer/tenant alheio/revogado, alvo ausente/revogado, último administrador, mudança do próprio papel, auditoria atômica e rollback. Concorrência de mudança de papel com revogação deve preservar administrador; permissão perdida durante espera deve ser revalidada. Usar locks/barreiras observáveis, não sleep como prova de ordenação. API compilada com JWT RSA efêmero comprova papel novo na consulta, acesso administrativo negado após rebaixamento e rollback de auditoria.

Preservar coverage e regressões BFF/UI. Revisão externa/CI consultados no PR, revisão humana antes de produção. [Evidências](../engineering/membership-role-validation.md). Concessão de vínculos, RLS e vertical fiscal continuam etapas próprias.
