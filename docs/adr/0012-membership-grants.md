# ADR 0012 — Concessão administrativa de memberships

Status: etapa autorizada após integração do PR #12. Organizations and Tenancy concede vínculos a atores internos já provisionados. Sem criar atores/organizações, bootstrap de primeiro administrador, reativação, convite por email, UI administrativa, RLS ou operação fiscal.

## Contrato e invariantes

PUT /v1/organizations/:organizationId/memberships/:actorId recebe exclusivamente JSON `{role}` pelo schema estrito de papel já compartilhado com PATCH. UUIDs, query vazia, Bearer antes da validação do controller, erros sanitizados e no-store. Parse JSON inválido pode ser rejeitado antes pelo middleware. Iniciador resolve issuer/subject verificados; papel no JWT, headers e campos adicionais não concedem administração.

Somente administrador ativo da organização concede vínculos. A autorização ocorre depois do mesmo advisory lock canônico usado por revogação e troca de papéis, dentro da transação. Negação uniforme 403 antes de consultar existência do ator alvo. Após autorização, ator inexistente: 404. Vínculo ativo com papel idêntico: 204 sem efeito/evento. Vínculo ativo com papel diferente ou vínculo revogado: 409; alterações usam PATCH, reativação permanece proibida. Vínculo ausente de ator existente: INSERT + evento atômicos, 204 sem corpo. Falha SQL/auditoria/lock: 503 sanitizado.

Identidade é global: um ator pode ter vínculos em organizações diferentes. O administrador precisa conhecer o UUID interno previamente provisionado; não há busca global ou exposição de identidade externa. Concessão de organization_admin exige administrador já ativo; não permite autoelevação nem bootstrap público. Retry após revogação não reativa o vínculo.

## Persistência e privilégios

Migration aditiva 0005 cria membership_grants: UUID, organização, iniciador/alvo, papel concedido, instante e requestId. FKs compostas referenciam vínculos da mesma organização e papel é vocabulário fechado. Eventos preservados por rollback de aplicação; nenhuma migration anterior é alterada.

Compartilhar administerMembership; consulta adicional distingue alvo revogado de vínculo ausente. Mesmo lock serializa concessão/revogação/troca de papel e revalida iniciador após espera. INSERT de membership e auditoria usam a mesma conexão/transação. Runtime recebe INSERT somente nas colunas organization_id, actor_id e role de memberships e INSERT no evento. Não recebe escrita de identidade, coluna revoked_at via INSERT, DELETE de vínculos, leitura/alteração/remoção dos eventos, ownership ou BYPASSRLS. Grants de UPDATE já necessários às operações existentes permanecem. Escritas externas devem respeitar o protocolo; credencial técnica com SQL arbitrário segue um risco sem RLS.

## Aceite e validação

Documentação primeiro. TDD no caso de uso, HTTP e adapter PostgreSQL: conceder, repetir, conflito de papel, revogado, ator ausente, identidade verificada, viewer/organização alheia/iniciador revogado, ausência de autoelevação, rollback da auditoria e restrições SQL. Concorrência concede somente um vínculo/evento; concessão de segundo administrador permite operação que antes era bloqueada por último administrador; espera pelo lock revalida permissão. A prova de ordenação observa locks, não depende de sleep.

API compilada com RSA efêmero e role SQL restrita demonstra ausência de acesso antes da concessão, acesso e papel novo depois, conflito sem troca silenciosa e rollback da auditoria. Regressões de revogação/troca de papel, BFF/browser e cobertura permanecem. [Evidências](../engineering/membership-grant-validation.md). Próximas etapas: RLS e administração BFF/UI, separadamente. Vertical fiscal permanece pendente de autorização própria.
