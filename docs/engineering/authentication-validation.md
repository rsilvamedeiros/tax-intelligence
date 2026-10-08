# Validação da primeira fronteira de autenticação

Escopo: [ADR 0006](../adr/0006-development-identity-provider.md). Keycloak escolhido para desenvolvimento após delegação explícita da escolha pelo mantenedor. API verifica access token e retorna identidade mínima; não cria sessão, membership ou acesso a tenant.

## TDD observado

Antes da implementação, `pnpm --filter @tax/api test --testPathPatterns=auth.spec.ts` falhou nos 22 testes novos: GET /v1/auth/me retornava 404, em vez de 401/200, e contrato OpenAPI estava ausente. Crypto e app carregaram corretamente; Red foi ausência do comportamento.

Após controller/verificador, os 22 passaram. Casos adicionais cobrem configuração, rotação, chave desconhecida, cache durante indisponibilidade, redirect recusado, JWKS inválido e modo desabilitado. Um teste de rotação inicialmente adiantou iat além da tolerância sem adiantar o relógio de validação; fixture temporal foi corrigida, sem relaxar o perfil de produção.

## Fronteiras verificadas

- HTTP real Nest e servidor JWKS local, sem mocks de assinatura. Chaves RSA privadas geradas no processo e descartadas.
- Assinatura, issuer, audience, azp, exp/iat/nbf, tipo de token, RS256 permitido e rejeição de substituição HS256/ID token.
- Resposta mínima, no-store, desafio Bearer, erro correlacionado e logs sem token/email/subject/tenant.
- Falha fechada quando JWKS indisponível/malformado/redirect ou configuração ausente; chave já confiável pode funcionar dentro do cache, conforme ADR.
- Smoke executa API compilada e verifica token RSA produzido por node:crypto, sem transformação Jest; health e requisição sem credencial exercitados.

Validação local executada: 89 testes aprovados (65 API, 11 contracts, 13 web); cobertura do módulo auth 100%, metas preservadas. Lint, tipos, build, formato, links de 66 arquivos Markdown e smoke OTLP/autenticação aprovados. Compose rejeitou senha admin ausente/vazia e aceitou preenchida; YAML/realm JSON parseados. Audit de produção sem alertas conhecidos; audit high passou, mantendo o achado moderado dev-only já registrado no ADR 0005.

Runner transforma somente jose ESM para os testes CommonJS. Runtime Node 24 usa o módulo real, verificado pelo smoke.

## Limites e revisão

Sem Docker/Java no PATH local. Compose standalone pode validar interpolação, mas não inicializa Keycloak. Job CI identity-provider inicia imagem fixada, importa realm e valida discovery/PKCE/JWKS; só declarar resultado remoto após conferir sua execução. Esse job não exerce login de usuário, token emitido por fluxo code ou callback BFF.

Autorrevisão do autor; revisão humana de autenticação ainda necessária antes de operação real. Não há sessão BFF, refresh, revogação local, membership ou RLS. Tokens JWT não têm revogação instantânea; cache de chave não equivale a sessão. A próxima etapa deve definir TTL/skew/refresh da sessão e provar callback, CSRF e logout com protocolo real. Provedor de produção, TLS, MFA e resposta operacional continuam pendentes.
