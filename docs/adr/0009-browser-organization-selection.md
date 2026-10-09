# ADR 0009 — Seleção de organização no navegador

Status: etapa de desenvolvimento autorizada após integração do PR #9. Sem deploy ou ampliação da exceção de acesso ao banco pela web.

## Decisão e contrato

Implementar listagem paginada e seleção por consulta ao contexto da API do ADR 0008. BFF expõe GET /api/organizations e GET /api/organizations/:organizationId/context. A sessão opaca identifica o token armazenado no servidor; Authorization, cookies externos e headers de tenant do navegador não são encaminhados à API. O destino upstream vem somente da configuração. Timeout, redirect:error, cache:no-store e schemas estritos em ambos os endpoints. IDs/query inválidos retornam 400 depois de verificar sessão; sessão ausente/expirada ou token rejeitado retorna 401; vínculo negado retorna 403; falha de storage, upstream ou contrato retorna 503 sanitizado. Sem proxy genérico de URLs ou respostas.

Somente auth/runtime.ts continua acessando database para sessões técnicas. O runtime compõe handlers de organizações com uma porta que lê a sessão existente; nenhum adapter de membership é usado pela web. Não criar sessão, ator, vínculo ou cookie de tenant na seleção. Leituras não alteram estado persistido e não exigem CSRF de mutação. Host deve corresponder à origem configurada; CORS não é aberto a terceiros.

## Jornada e limites

Após login, exibir organizações com nomes e papéis em português, estado vazio, indisponibilidade com retry, paginação e seleção acessível por botão. Seleção chama context novamente: a listagem anterior não concede acesso. Somente resposta validada aparece como contexto selecionado. Recarregar página, retomar foco/visibilidade, trocar página, sessão ou iniciar logout limpa seleção e reconsulta; requisições antigas são canceladas e não podem restaurar dados. Seleção é temporária no componente, sem localStorage ou autorização em cache. Uma futura ação de negócio deve validar novamente o vínculo na API.

Revogação após listagem deve negar seleção com o mesmo 403 para vínculo ausente/inexistente. Token/sessão não são enviados a componentes, respostas, logs ou screenshots. Navegador recebe apenas os schemas públicos de organização/contexto. Administração, auditoria/locks, RLS, refresh de token e ação fiscal continuam pendentes.

## Aceite e entrega

TDD por comportamento em BFF e React: listar, validar seleção, paginação, vazio, retry, 401/403/503, contrato inesperado, sessão substituída/logout e resposta antiga. Mock somente transporte/storage nas fronteiras; SQL/criptografia continuam provados pelas integrações existentes. Estender jornada real Keycloak com organizações sintéticas em PostgreSQL, tentativa cruzada e revogação antes de seleção. Não chamar essa jornada de E2E-01 completo: ainda não existe ação de negócio.

Sem migration nesta entrega. Rollback de aplicação remove a jornada e endpoints BFF, preservando sessões, atores e vínculos. Evidências na [validação](../engineering/browser-organization-validation.md).
