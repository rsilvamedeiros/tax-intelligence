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

## Fronteira BFF de organizações implementada

O BFF expõe as consultas existentes como GET /api/organizations e GET /api/organizations/:organizationId/context, usando exclusivamente o token da sessão server-side. Não encaminha Authorization, cookies ou tenant fornecidos pelo navegador. Aceita somente paginação/UUID do contrato; não há proxy genérico. Retorna schemas públicos estritos, 401 para sessão rejeitada, 403 para vínculo negado e 503 sanitizado em falha. [Decisão da jornada](../adr/0009-browser-organization-selection.md).

## Contratos propostos para a vertical, sem implementação

`POST /v1/documents` recebe JSON sintético e `Idempotency-Key`. Tenant vem da associação autenticada, não de payload confiado. Resposta 201 com ID opaco, status e request ID; repetição equivalente retorna resultado original; mudança de conteúdo sob a mesma chave retorna 409. `GET /v1/documents/:id` e `/diagnostics/:id` consultam sempre com filtro tenant. Recurso externo ao tenant retorna 404 para impedir enumeração.

DTOs de escrita: validação whitelist, rejeição de campos extras, limites de tamanho e profundidade; valores monetários em unidade inteira ou decimal exato, nunca float. Separar autenticação (401), autorização de ação (403), recurso fora de escopo (404), conflito (409), entrada inválida (400/422 conforme contrato aprovado) e falha operacional (503).

OpenAPI deve declarar status, schemas, limites, segurança, idempotência e exemplos sintéticos antes do controller. Contract tests confrontam o endpoint com schemas e OpenAPI; não confiar apenas no tipo TypeScript.
