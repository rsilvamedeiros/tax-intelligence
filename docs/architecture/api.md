# Contratos REST e aplicação

Base: `/v1`; versão do contrato independente da versão do pacote. Swagger em desenvolvimento, não publicado por padrão em produção. Contratos compartilhados em `packages/contracts`; schemas runtime devem rejeitar campos inesperados. Mudanças incompatíveis exigem nova versão ou janela de migração documentada.

## Fronteira operacional implementada

| Endpoint             | Resultado                             | Autorização                                         |
| -------------------- | ------------------------------------- | --------------------------------------------------- |
| GET /v1/health/live  | 200, processo ativo                   | Sem dados de negócio; público somente na rede local |
| GET /v1/health/ready | 200 ou 503; dependências configuradas | Restringir detalhes na futura borda de produção     |
| GET /docs            | OpenAPI e UI                          | Somente desenvolvimento                             |

Exemplo: `{"status":"ok","service":"tax-intelligence-api","checks":{"database":"not_configured"}}`. Banco ausente é permitido **somente no bootstrap fora de produção**; produção exige DATABASE_URL. Indisponibilidade de banco configurado deve produzir 503. Liveness não consulta banco.

Erro padrão: `{"statusCode":404,"code":"REQUEST_REJECTED","message":"Requisição rejeitada","requestId":"00000000-0000-4000-8000-000000000001"}`. Nunca incluir stack, SQL, tokens ou entradas. `x-request-id` só é reutilizado se UUID válido; demais valores são substituídos. Logs correlacionam o mesmo identificador.

## Fronteira de identidade implementada

Fronteira de identidade implementada nesta etapa: `GET /v1/auth/me` verifica Bearer JWT no perfil Keycloak e retorna somente `{issuer, subject}`, conforme schema estrito em contracts. Sem token ou token inválido: 401 com WWW-Authenticate Bearer e erro correlacionado. Configuração ausente ou verificação indisponível: 503 sanitizado. OpenAPI declara segurança Bearer e respostas. O endpoint não cria usuário, sessão, membership ou acesso a documentos; health permanece público. Configuração e limites no [ADR 0006](../adr/0006-development-identity-provider.md).

## Consulta de memberships implementada

`GET /v1/organizations` retorna `{items: [{id, name, role}], nextCursor}` somente para vínculos ativos do ator. Limit padrão 25, inteiro decimal 1–100; cursor UUID e ordenação por UUID. Identidade não provisionada recebe lista vazia. `GET /v1/organizations/:organizationId/context` retorna `{organization: {id, name}, role}`; vínculo ausente/revogado ou organização inexistente retorna o mesmo 403. Não aceita query nessa rota. Ambas exigem Bearer antes de validar entrada, rejeitam queries inesperadas com 400, usam no-store e retornam 503 sanitizado em indisponibilidade. Headers de tenant e roles do token não concedem acesso. Contratos estritos/OpenAPI em contracts; [decisão e limites](../adr/0008-membership-directory.md), [evidências](../engineering/membership-validation.md).

## Revogação administrativa implementada

DELETE /v1/organizations/:organizationId/memberships/:actorId exige administrador ativo na organização. UUIDs e query vazia são validados depois do Bearer; nenhum corpo é aceito, inclusive text/plain ou transporte chunked. Erros de parse JSON podem ser rejeitados pelo middleware antes do controller. Iniciador vem de issuer/subject, ignorando role no token e headers de tenant. Sucesso/repetição/alvo ausente: 204 sem corpo, sempre após autorização; último administrador: 409; acesso negado: 403 uniforme; falha de transação/auditoria: 503 sanitizado. Evento de revogação usa o requestId validado da resposta, sem identidade externa. [ADR 0010](../adr/0010-membership-revocation.md), [evidências](../engineering/membership-revocation-validation.md). Não há endpoint BFF administrativo.

## Alteração administrativa de papéis implementada

PATCH /v1/organizations/:organizationId/memberships/:actorId aceita exclusivamente JSON `{role}` do vocabulário fechado compartilhado; IDs UUID, query vazia e campos extras rejeitados. Iniciador deriva do Bearer verificado; administrador ativo é revalidado dentro da transação. Sucesso/repetição: 204, acesso administrativo negado: 403, alvo ausente/revogado após autorização: 404, último administrador: 409, falha de auditoria/storage: 503 sanitizado. Não cria/reativa vínculos. Schema runtime e OpenAPI provados pelo contrato HTTP. [ADR 0011](../adr/0011-membership-role-changes.md), [evidências](../engineering/membership-role-validation.md).

## Fronteira BFF de organizações implementada

Administração no BFF implementada no [ADR 0014](../adr/0014-administrative-membership-bff.md): GET /api/organizations/:organizationId/memberships e PUT/PATCH/DELETE /api/organizations/:organizationId/memberships/:actorId. Sessão server-side fornece Bearer; mutações exigem Origin/CSRF e payload estrito limitado a 1024 bytes. API revalida administrador ativo; 204 sem corpo e erros previstos sanitizados. Sem proxy genérico, token no browser ou acesso SQL de domínio pela web. [Validação](../engineering/administrative-membership-bff-validation.md).

O BFF expõe as consultas existentes como GET /api/organizations e GET /api/organizations/:organizationId/context, usando exclusivamente o token da sessão server-side. Não encaminha Authorization, cookies ou tenant fornecidos pelo navegador. Aceita somente paginação/UUID do contrato; não há proxy genérico. Retorna schemas públicos estritos, 401 para sessão rejeitada, 403 para vínculo negado e 503 sanitizado em falha. [Decisão da jornada](../adr/0009-browser-organization-selection.md).

## Contratos propostos para a vertical, sem implementação

`POST /v1/documents` recebe JSON sintético e `Idempotency-Key`. Tenant vem da associação autenticada, não de payload confiado. Resposta 201 com ID opaco, status e request ID; repetição equivalente retorna resultado original; mudança de conteúdo sob a mesma chave retorna 409. `GET /v1/documents/:id` e `/diagnostics/:id` consultam sempre com filtro tenant. Recurso externo ao tenant retorna 404 para impedir enumeração.

DTOs de escrita: validação whitelist, rejeição de campos extras, limites de tamanho e profundidade; valores monetários em unidade inteira ou decimal exato, nunca float. Separar autenticação (401), autorização de ação (403), recurso fora de escopo (404), conflito (409), entrada inválida (400/422 conforme contrato aprovado) e falha operacional (503).

OpenAPI deve declarar status, schemas, limites, segurança, idempotência e exemplos sintéticos antes do controller. Contract tests confrontam o endpoint com schemas e OpenAPI; não confiar apenas no tipo TypeScript.

## Consulta administrativa implementada

Consulta administrativa: GET /v1/organizations/:organizationId/memberships retorna somente actorId, role e status active/revoked, com limit/cursor do contrato existente. Exige administrador ativo no mesmo snapshot SQL da listagem; negação uniforme 403, falha 503 sanitizada, respostas no-store. Não expõe identidade externa ou auditoria. [ADR 0013](../adr/0013-administrative-membership-directory.md), [validação](../engineering/administrative-membership-directory-validation.md). Exposição no BFF segue o ADR 0014.

## Concessão administrativa implementada

PUT /v1/organizations/:organizationId/memberships/:actorId usa o corpo estrito de papel compartilhado com PATCH. Administrador ativo é revalidado dentro da transação. Criação/repetição do mesmo papel: 204; acesso negado: 403 antes de consultar alvo; ator inexistente após autorização: 404; vínculo revogado ou papel diferente: 409; falha SQL/auditoria: 503 sanitizado. Não cria identidade, reativa vínculo ou altera papel existente. BFF administrativo definido no ADR 0014. [ADR 0012](../adr/0012-membership-grants.md), [evidências](../engineering/membership-grant-validation.md).
