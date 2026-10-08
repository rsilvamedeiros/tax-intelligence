# ADR 0007 — Login BFF e sessões técnicas

Status: decisão desta etapa autorizada pelo mantenedor após PR #6. Produção e deploy continuam pendentes de revisão. Escopo: login/logout/sessão; sem membership ou acesso a documentos.

## Contrato e decisão antes do código

Next.js BFF usa openid-client 6, Authorization Code + PKCE S256, state/nonce por tentativa e validação criptográfica do ID token. Metadados explícitos do realm Keycloak; endpoints e callback não derivam de parâmetros do usuário. [openid-client](https://github.com/panva/openid-client) e [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

| Rota BFF               | Comportamento                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/auth/login    | 302 para provedor, cookie opaco de tentativa com validade de 5 minutos; destino final fixo `/`                                     |
| GET /api/auth/callback | Consome tentativa uma única vez, valida state/nonce/PKCE/assinatura, verifica access token na API e cria nova sessão; 303 para `/` |
| GET /api/auth/session  | 200 com identidade mínima e token CSRF; 401 sem sessão válida; nunca retorna access/refresh token                                  |
| POST /api/auth/logout  | Origin exata + token CSRF, revogação persistida e remoção do cookie; 204. Origem/token inválido: 403                               |

Erros de callback/entrada inválida: 400; verificação/armazenamento indisponível: 503 sanitizado, sem URL/token/stack. Todas as respostas no-store; callback/login também Referrer-Policy no-referrer. Cookies HttpOnly, SameSite=Lax, Path=/, sem Domain, Secure com origem HTTPS. HTTP somente loopback em desenvolvimento/testes. Novo identificador de sessão após login impede fixation. Callback inválido/repetido não cria sessão.

## Persistência e limite arquitetural

PostgreSQL, schema técnico auth_bff, entradas por hash SHA-256 do cookie aleatório de 256 bits. Payload AES-256-GCM, chave de 32 bytes no ambiente BFF_SESSION_ENCRYPTION_KEY; identificador/kind vinculados por AAD. Tentativa contém state/nonce/verifier; sessão contém access token e identidade validada. DELETE RETURNING consome tentativa atomicamente, inclusive sob concorrência. Expiração persistida e limpeza de expirados ao criar entrada, com índice de expiração.

Exceção deliberada à fronteira web: somente `apps/web/server/auth/runtime.ts`, marcado server-only, pode importar @tax/database para sessões técnicas. React e demais módulos web continuam proibidos de importar banco; nenhum dado de negócio ou tabela tenant-owned é consultado pelo BFF. Pool próprio via BFF_DATABASE_URL, sem fallback DATABASE_URL. Produção exige role limitada ao schema auth_bff, credencial distinta e chave em armazenamento de segredos; migrations continuam fora do startup.

Alternativas: memória perde logout/estado entre processos e reinícios; cookie com token cifrado continua sendo armazenamento no browser e torna revogação mais difícil; Redis adiciona serviço sem necessidade desta etapa. PostgreSQL já faz parte da stack. Chave compartilhada entre instâncias permite ler sessão existente; rotação de chave nesta versão exige invalidar sessões, não fingir suporte a chave antiga.

Sessão expira com access token, no máximo 300 segundos. Sem refresh nem offline_access; refresh token eventualmente recebido é descartado. Sessão expirada exige novo login (SSO no provedor pode reduzir interação). Logout local invalida cookie e entrada; não promete logout global no IdP nem revogação instantânea do JWT copiado. Revisão humana e configuração operacional exigidas antes de dados reais.

## Aceite

Red/Green de login, callback inválido/replay, sessão, Origin/CSRF e logout. PostgreSQL real comprova cifragem, expiração, consumo concorrente e revogação entre instâncias. Cypress em CI deve autenticar usuário sintético no Keycloak real e passar pela API; não injetar sessão como substituto desse teste. Docker não está disponível localmente; reportar esse limite, executar protocolo real no CI. Nenhum segredo fixo ou pessoa real em fixture/realm.
