# ADR 0019 — API do lote sintético

Data: 20/10/2026. Status: próxima etapa solicitada pelo mantenedor. Depende da persistência da PR #22, ainda aberta no início desta entrega. A branch será comparada à base dessa PR enquanto ela não for integrada; não autoriza merge automático.

## Recorte e contrato

Compor a persistência do ADR 0018 na API: POST `/v1/organizations/:organizationId/synthetic-document-batches` e GET da mesma rota com `/:batchId`. Bearer verificado fornece identidade; headers de tenant ou papel não autorizam. Criar/repetir exige administrador ou analista ativo; ler admite os quatro papéis ativos, revalidados na transação existente.

POST exige application/json, até 16 KiB de corpo efetivo, inclusive chunked, query vazia, UUID de organização e exatamente um Idempotency-Key UUIDv4. Mesmo comando retorna 200 com recibo original; criação retorna 201; divergência retorna 409. GET rejeita corpo e query e valida os UUIDs. Respostas usam schemas compartilhados, no-store e request ID. 400/401/403/404/409/413/415/503 seguem erros sanitizados existentes; 404 não distingue lote externo. Erros de parsing/limite podem preceder autenticação; validação no controller ocorre depois do Bearer.

## Composição e segurança

`SYNTHETIC_BATCH_DATABASE_URL` configura exclusivamente o pool do lote; jamais usar DATABASE_URL como fallback. Ausência mantém bootstrap disponível e retorna 503 nas operações; configuração inválida falha sem registrar a URL. O login dedicado deve ser diferente dos logins administrativo e BFF, sem ownership, superuser, BYPASSRLS ou memberships de roles. Antes de cada operação, verificar o perfil efetivo de privilégios nas tabelas usadas: SELECT/INSERT fiscal, INSERT das colunas de evento, SELECT de controle, sem escrita de controle, leitura/mutação de auditoria, DDL ou auth_bff. O runtime não provisiona roles, grants ou migrations. Encerrar seu próprio pool no shutdown.

Limite específico é aplicado por parser de rota antes do parser JSON geral, contando bytes descomprimidos e rejeitando conteúdo comprimido neste contrato. Erros não expõem SQL, identidade externa, corpo ou credencial; logs continuam com allowlist. O setting mutável não protege um processo comprometido com SQL arbitrário.

## Plano e aceite

Documentação primeiro; Red HTTP para POST ausente, Green mínimo; Red de replay/consulta e transporte antes de completar esses comportamentos. Testes HTTP usam aplicação Nest real e mock somente na fronteira de persistência/autenticação. Integração compilada executa JWT RSA/JWKS local e PostgreSQL isolado com login realmente restrito, verifica replay/conflito, negação e ausência de fallback. Regressões PostgreSQL existentes continuam bloqueantes.

Executar lint, tipos, cobertura, build, integração PostgreSQL/HTTP compilada, smokes, formato e links; registrar comandos e resultados. Revisar diff e solicitar revisão externa na PR, sem confundir status com revisão executada. Reversão desabilita credencial/consumidor e preserva migration, RLS e auditoria. Sem BFF/UI, diagnóstico, dados fiscais reais, deploy ou nova migration nesta etapa. Evoluir limites/contenção apenas com medição e decisão própria.
