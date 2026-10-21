# ADR 0020 — BFF do lote sintético

Data: 20/10/2026. Status: próxima etapa solicitada após integração da PR #23 (`50183cf`). Continua a [RFC 0003](../rfc/0003-synthetic-document-intake.md) e os contratos do ADR 0019. Autoriza BFF de criação/consulta, sem interface visual, diagnóstico, cálculo fiscal, banco de domínio na web ou deploy.

## Contrato e fronteiras

POST `/api/organizations/:organizationId/synthetic-document-batches` e GET da mesma rota com `/:batchId`. Handlers Node usam a sessão técnica existente; somente o runtime server-only de autenticação compõe o leitor de sessão e o transporte HTTP. Nenhuma nova credencial/configuração de produção, migration ou dependência. Token vem exclusivamente da sessão, nunca de Authorization/tenant/role/cookie repassado pelo browser. API revalida membership/papel em cada operação; seleção visual não autoriza.

Host deve coincidir com a origem configurada, sem confiar em forwarded headers; POST exige Origin exata e x-csrf-token de 43 caracteres base64url comparado à sessão em tempo constante. Sessão ausente/expirada: 401. Origin/CSRF inválido: 403, sem upstream. Validar sessão antes de UUID/query/corpo, salvo host/origin/método. UUIDs e query vazia usam contracts. POST aceita somente JSON UTF-8 sem compressão, até 16 KiB efetivos lidos de stream; excesso 413, mídia/compressão não aceita 415, JSON/campos inválidos 400. GET rejeita corpo/framing e query com 400.

POST exige exatamente uma chave Idempotency-Key UUIDv4, normalizada em minúsculas. O browser gera a intenção e conserva a chave nas tentativas do mesmo comando; BFF não gera nem troca chave e não faz retry automático. Duplicação de headers aparece concatenada e é rejeitada pelo schema. Criação preserva 201; replay preserva 200; divergência preserva 409. Falha 503 ou conexão perdida pode ter ocorrido depois do commit: futura UI deve repetir o mesmo comando/chave ou consultar recurso conhecido, sem presumir ausência de efeito.

Upstream recebe somente path fixo com UUID validado, Bearer da sessão, método constante, JSON normalizado e chave validada. No-store, redirect proibido e timeout de 3s. Sucesso é projetado pelos schemas estritos de recibo/detalhe; limitar também a resposta JSON a 16 KiB. Erros conhecidos 400/401/403/404/409/413/415 são sanitizados, demais status/falhas viram 503. Nenhum corpo/header arbitrário upstream, token ou identidade externa é reproduzido. Respostas têm no-store e no-referrer; correlação/auditoria seguem na API.

## Plano, riscos e aceite

Documentação → stub válido → Red de POST não implementado → Green de encaminhamento pela sessão → Red de replay/status/validação quando aplicável → Green → regressões negativas e refatoração. Testes usam Request/Response/streams reais, com mocks somente de sessão e transporte. Registrar Red real separadamente das regressões.

Cobrir host, Origin, CSRF, sessão, UUID/query, chaves, limite exato/excesso inclusive stream sem Content-Length, UTF-8 inválido, mídia/compressão, GET sem corpo, schemas/status e erros privados. Estender a jornada compilada de sessão real com Keycloak/Chrome e PostgreSQL isolado: criar, repetir, conflitar, consultar, tentar tenant externo e invalidar sessão. BFF e API usam roles distintas, domínio com login dedicado restrito; cleanup remove apenas fixtures próprias.

Validar lint, tipos, cobertura, build, smokes, formato/links e jobs CI; não declarar browser executado localmente sem ambiente. Revisão estática/arquitetura/segurança local é autorrevisão; solicitar revisão externa na PR e registrar limitações. Aprovação humana antes de merge. Reversão remove/desabilita consumidor BFF, preservando dados/auditoria/RLS da API. Criar UI e diagnóstico requer próxima etapa própria.
