# ADR 0013 — Consulta administrativa de membros

Status: etapa autorizada após integração do PR #13. Preparar a administração BFF/UI com consulta dos vínculos existentes; não criar identidades, busca global, reativação, endpoints BFF, RLS ou operação fiscal.

## Contrato e privacidade

GET /v1/organizations/:organizationId/memberships aceita somente limit (1–100, padrão 25) e cursor UUID, reutilizando o contrato estrito de paginação. Bearer verificado antes da validação do controller. Organização inválida/query desconhecida: 400; identidade ausente/inválida: 401; ator não provisionado, vínculo ausente/revogado, papel não administrativo ou organização inexistente/alheia: 403 uniforme. Falha de armazenamento ou resposta inválida: 503 sanitizado. Respostas no-store e requestId seguem o padrão da API.

Somente administrador ativo da organização consulta. Resposta 200: `{items: [{actorId, role, status}], nextCursor}`. Papéis usam o vocabulário existente; status é active ou revoked. Inclui vínculos revogados para evitar confundir revogação com ausência, sem permitir reativação. Não expõe issuer, subject, email, nomes de identidade, instantes ou eventos de auditoria. UUID interno não autoriza nenhuma operação.

Ordenação ascendente por actorId; cursor exclusivo e opaco para autorização, sem exigir que pertença à organização. Busca limit + 1 determina próxima página. Paginação não oferece snapshot entre requisições: novas concessões anteriores ao cursor podem exigir reiniciar a consulta. Próxima consulta observa alterações já confirmadas de permissão e estado.

## Persistência e consistência

Uma única instrução SQL parametrizada condiciona a leitura à membership administrativa ativa no mesmo snapshot PostgreSQL. Não separar autorização e listagem em consultas com janela de revogação. Resultado distingue negação de página autorizada vazia, inclusive cursor após o último membro. Revogação concorrente confirmada depois do snapshot não invalida retroativamente a resposta em andamento; a consulta seguinte é negada. Não adquirir locks de escrita para uma leitura.

Utilizar PK existente (organization_id, actor_id), sem migration nem novo privilégio: SELECT de memberships já concedido ao runtime. Identidade resolve issuer/subject verificados no repositório existente. Sem acesso ao banco pelo web. SQL arbitrário com credencial técnica continua fora da garantia de isolamento de aplicação; RLS permanece pendente.

## Aceite e riscos

Documentação antes do código; Red/Green em contrato, serviço, HTTP e PostgreSQL real. Verificar projeção mínima, limite/cursor, página vazia, membros ativos/revogados, organização alheia/inexistente, todos os papéis não administrativos, revogação/rebaixamento confirmados e erro sanitizado. Integração com API compilada, JWT RSA e role SQL restrita comprova composição real. Nenhuma alteração nas operações administrativas existentes.

[Evidências da etapa](../engineering/administrative-membership-directory-validation.md). A UI administrativa e a vertical fiscal seguem em etapas próprias; não presumir autorização fiscal.
