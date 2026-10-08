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

## Contratos propostos para a vertical, sem implementação

`POST /v1/documents` recebe JSON sintético e `Idempotency-Key`. Tenant vem da associação autenticada, não de payload confiado. Resposta 201 com ID opaco, status e request ID; repetição equivalente retorna resultado original; mudança de conteúdo sob a mesma chave retorna 409. `GET /v1/documents/:id` e `/diagnostics/:id` consultam sempre com filtro tenant. Recurso externo ao tenant retorna 404 para impedir enumeração.

DTOs de escrita: validação whitelist, rejeição de campos extras, limites de tamanho e profundidade; valores monetários em unidade inteira ou decimal exato, nunca float. Separar autenticação (401), autorização de ação (403), recurso fora de escopo (404), conflito (409), entrada inválida (400/422 conforme contrato aprovado) e falha operacional (503).

OpenAPI deve declarar status, schemas, limites, segurança, idempotência e exemplos sintéticos antes do controller. Contract tests confrontam o endpoint com schemas e OpenAPI; não confiar apenas no tipo TypeScript.
