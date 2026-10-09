# ADR 0006 — Provedor de identidade e primeira fronteira da API

Status: decisão da etapa de desenvolvimento, após delegação da escolha ao agente pelo mantenedor. Produção, contratação e deploy não autorizados. A [RFC 0001](../rfc/0001-identity-membership-isolation.md) orienta o desenho; sessões BFF foram definidas posteriormente no [ADR 0007](0007-bff-session-storage.md). Membership e RLS seguem pendentes.

## Decisão e alternativas

Keycloak é o provedor de desenvolvimento: OIDC padronizado, federação e gestão de identidades externas à aplicação. Usar versão estável fixada, realm exclusivo, Authorization Code com PKCE S256 e audience própria da API. Entra ID seria apropriado com tenant já disponível; serviço gerenciado depende de conta, orçamento e operação ainda não definidos. Um servidor OIDC em Node é útil em testes, mas exigiria manter a experiência de identidade para servir como provedor principal.

API usa jose 6 para verificação criptográfica e JWKS remota, sem autenticação própria por senha. NestJS continua na versão compatível registrada; Node 24 suporta o runtime ESM da biblioteca. A integração usa configuração explícita, não descoberta a partir de entrada do usuário. [jose](https://github.com/panva/jose), [Keycloak](https://www.keycloak.org/getting-started/getting-started-docker).

## Perfil de token e contrato anterior ao código

Primeira entrega: `GET /v1/auth/me`, Authorization Bearer, resposta 200 estrita `{issuer, subject}` do token verificado, sem roles, email, token ou tenant. Sem credencial/token inválido: 401, WWW-Authenticate Bearer e erro padrão correlacionado. Verificação indisponível ou configuração ausente: 503 sanitizado. Health permanece público na fronteira local. Não há criação de usuário ou autorização de negócio por esse endpoint.

Perfil Keycloak: RS256; issuer exato; audience `tax-intelligence-api`; azp do client `tax-intelligence-web`; claim typ `Bearer` (ID token não é aceito), header typ JWT; sub não vazio; exp e iat obrigatórios. Validade máxima de 300 segundos, tolerância de relógio de 5 segundos; JWT sem exp, futuro ou com vida superior ao perfil é inválido. O [TokenManager do Keycloak](https://github.com/keycloak/keycloak/blob/26.8.0/services/src/main/java/org/keycloak/protocol/oidc/TokenManager.java) distingue tipos de token; mappers não devem sobrescrever essas claims.

O client web deve incluir explicitamente o [mapper oficial Subject](https://www.keycloak.org/admin-api/protocol-mappers), `oidc-sub-mapper`, com `access.token.claim=true`. Sem scopes padrão, Keycloak não adiciona automaticamente `sub` ao access token. O mapper preserva o identificador do usuário do provedor; nome, e-mail, roles e scopes de perfil não são necessários para o contrato `{issuer, subject}`. A jornada real deve obter 303 no callback e uma sessão aceita pela API, além de verificar o logout.

OIDC_ISSUER, OIDC_JWKS_URL, OIDC_AUDIENCE e OIDC_CLIENT_ID devem estar todos configurados ou todos ausentes. HTTP permitido apenas em loopback fora de produção; HTTPS obrigatório em produção. JWKS no mesmo origin do issuer, sem credentials/query/fragment; redirects negados. Ausência de configuração desabilita somente a fronteira de autenticação com 503, sem liberar acesso. Timeout de JWKS 2 segundos, cache 5 minutos e cooldown de refresh 5 segundos; chave desconhecida gera 401, indisponibilidade sem chave confiável gera 503. Chave já confiável em cache pode verificar até o cache expirar; revogação não é instantânea.

## Aceite e sequência

TDD HTTP com app real e JWKS local: Red pela rota ainda ausente, Green após mínimo. Negativos de assinatura, tempo, tipo, issuer/audience/client, configuração, headers e privacidade; chaves privadas geradas no teste, nunca versionadas. Teste de rotação e indisponibilidade usa servidor HTTP real controlado. Não afirmar login OIDC ou Keycloak real validado com esse teste.

Configuração Compose/realm será entregue para desenvolvimento sem senha literal nem usuários reais. Docker/Java não estão disponíveis no PATH local; validação de configuração não equivale à inicialização do provedor. Após a fronteira API: login BFF, sessão server-side e CSRF com teste de protocolo real, depois membership/isolamento. Produção exige revisão humana de autenticação e decisões operacionais; API autenticada não implica autorização de tenant.
