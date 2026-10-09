# ADR 0014 — Administração de memberships pelo BFF

Status: etapa autorizada após integração do PR #14. Expor operações administrativas existentes da API ao navegador com sessão server-side e proteção de mutações; UI administrativa, criação de identidade, reativação, RLS e operação fiscal permanecem pendentes.

## Contrato e autorização

GET /api/organizations/:organizationId/memberships aceita limit/cursor e devolve o schema mínimo da API. PUT e PATCH /api/organizations/:organizationId/memberships/:actorId recebem JSON estrito `{role}`; DELETE no mesmo caminho não recebe corpo/query. Reutilizar schemas existentes, sem proxy genérico ou busca global. Identificadores UUID e queries duplicadas/desconhecidas são rejeitados.

O BFF lê exclusivamente tax_session no armazenamento server-side. Upstream recebe somente Bearer da sessão, seletores validados e papel solicitado para o alvo conforme contrato. Authorization, cookies, tenant, claims de autorização e URLs do cliente não são encaminhados. API decide administrador ativo em cada operação; o BFF não mantém cache de autorização. Token nunca aparece na resposta. Host configurado é obrigatório (400 em discrepância). Sessão ausente/expirada/malformada: 401 antes de validar seletores, salvo rejeição inicial de host/origin/método.

Mutações exigem Origin exatamente igual à origem configurada e x-csrf-token vinculado à sessão (43 caracteres base64url, comparação timing-safe). Origin/CSRF inválido: 403 sem upstream. JSON precisa de Content-Type application/json e leitura limitada a 1024 bytes, inclusive sem Content-Length. Corpo inválido/excedido ou DELETE com corpo: 400. Somente métodos da operação são aceitos; método incompatível no handler: 405. Sessão técnica existente disponibiliza accessToken e csrfToken somente no servidor.

GET mantém 200 e negações 401/403; mutações mantêm 204 vazio e erros previstos 400/401/403/404/409. Outros status, redirects, payload de sucesso inválido, falha de sessão/transporte: 503 sanitizado. Nenhum corpo/header de erro upstream é reproduzido. Respostas dos handlers incluem no-store e no-referrer; métodos não exportados seguem rejeição padrão do Next. Timeout upstream 3s e redirects proibidos. Auditoria/correlação continuam geradas pela API.

## Implementação e riscos

Handlers independentes de Next/database usam portas de sessão e transporte. Composição somente em apps/web/server/auth/runtime.ts com server-only; BFF continua com credencial exclusiva de auth_bff. Nenhuma ampliação de acesso do web a tabelas de domínio. Runtime HTTP permite somente caminhos construídos com UUID validado, método constante e corpo normalizado. Nenhuma migration/dependência/grant novo de produção.

Mutação interrompida depois do commit da API pode ser repetida: PUT/PATCH iguais e DELETE são idempotentes nos contratos existentes. Conflitos de vínculo revogado continuam 409. Interface futura deve consultar novamente e não interpretar erro de rede como ausência de efeito. Não reenviar automaticamente uma mudança de papel antiga depois de conflito. Não presumir que CSRF substitui autorização de organização.

## Aceite e TDD

Documentar primeiro. Red/Green do leitor de sessão e dos handlers: token server-side, host/origin/CSRF, sessão ausente, UUID/query duplicada/desconhecida, JSON estrito/bytes em stream, DELETE sem corpo, status previstos, redirects, erro/payload sensível e falhas de armazenamento. Validar build com rotas Next reais.

Estender jornada Keycloak/Chrome com cookies reais, listagem, tentativa cruzada, negação CSRF, concessão idempotente, troca de papel, revogação sem reativação e perda de acesso após auto-rebaixamento permitido por segundo administrador. Fixtures sintéticas provisionadas apenas via owner do banco isolado; API/BFF usam roles distintas/restritas, limpeza inclui eventos próprios. A jornada existente de seleção/logout continua exigida. Evidências de E2E escrito após implementação são regressão complementar, sem TDD retroativo.

[Registro de validação](../engineering/administrative-membership-bff-validation.md). Aprovação humana obrigatória para esta fronteira de autorização/CSRF; sem merge/deploy automático.
