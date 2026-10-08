# Setup local e troubleshooting

Pré-requisitos da stack: Node 24 LTS, pnpm 10.24.0 e Git; Chrome para E2E. PostgreSQL 17 para integração; Docker opcional para desenvolvimento, necessário apenas se optar por Compose. Binários locais PostgreSQL também podem criar instância de teste independente; testes locais desta etapa usaram PostgreSQL 18.1. [Resultados técnicos](bootstrap-validation.md).

Comandos da fundação:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm build
pnpm dev
```

Verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`, `pnpm test:smoke`, `pnpm test:e2e`. Smoke valida exporter OTLP contra um collector local temporário. E2E usa Chrome por padrão; `E2E_BROWSER` pode selecionar outro browser instalado. E2E não lê .env nem usa DATABASE_URL: exporte TEST_DATABASE_URL se quiser readiness com banco real. Sem essa variável, usa o modo bootstrap sem banco. Migração e integração exigem build de database; não usam banco de produção.

Web: http://127.0.0.1:3000. API: http://127.0.0.1:3001/v1/health/live. Swagger local: http://127.0.0.1:3001/docs. Não usar esses endereços como integração governamental.

Banco local proposto:

```powershell
$env:POSTGRES_PASSWORD = 'local_only_change_me'
docker compose -f infrastructure/docker/compose.yaml up -d
$env:DATABASE_URL = 'postgresql://tax_local:local_only_change_me@127.0.0.1:5432/tax_intelligence'
pnpm db:migrate
docker compose -f infrastructure/docker/compose.yaml exec postgres createdb -U tax_local tax_intelligence_test
$env:TEST_DATABASE_URL = 'postgresql://tax_local:local_only_change_me@127.0.0.1:5432/tax_intelligence_test'
pnpm test:integration
```

Credenciais acima são locais e demonstrativas. Não reutilizar em produção. Comando createdb será necessário uma única vez; banco existente deve ser preservado.

## Keycloak de desenvolvimento

Requer Docker disponível. Perfil `identity` é opcional; iniciar somente o serviço identity não inicia PostgreSQL. Compose valida também a variável POSTGRES_PASSWORD do arquivo, mesmo nesse perfil. Gere credenciais locais sem versioná-las:

```powershell
$env:KEYCLOAK_ADMIN_PASSWORD = [Guid]::NewGuid().ToString('N')
if (-not $env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD = [Guid]::NewGuid().ToString('N') }
docker compose -f infrastructure/docker/compose.yaml --profile identity up -d identity
node scripts/smoke-identity-provider.mjs
```

Console local: http://127.0.0.1:8080, administrador `local_admin` e senha do ambiente. Realm `tax-intelligence`, sem usuários importados. Crie somente usuário sintético no console. Realm já existente no volume não é atualizado pelo import; atualizar clientes explicitamente e preservar dados, sem remover volumes existentes para aplicar configuração. Usuários e senhas reais não fazem parte do setup.

Para habilitar a API, exporte as quatro OIDC_* de [.env.example](../../.env.example) ou adicione-as ao .env local; todas são necessárias. Use issuer e callback em 127.0.0.1, sem alternar localhost. O client web usa code + PKCE S256; implicit, password grant e service accounts estão desabilitados. O callback `/api/auth/callback` está implementado pelo BFF; configure as variáveis abaixo para login no navegador. Tokens não devem ser colados em issue, PR, terminal gravado ou log.

Smoke do provedor verifica realm importado, discovery e chaves públicas; smoke de autenticação verifica o processo compilado da API com token sintético e JWKS local. A jornada real é executada separadamente por `pnpm test:e2e:auth`, com usuário sintético criado e removido automaticamente. Imagem Keycloak e realm são de desenvolvimento, sem configuração de produção. Sem Docker local, executar o fluxo real do provedor no job CI `identity-provider` e registrar o limite local.

## Diagnóstico de falhas

- Engine incompatível: conferir `node --version` e caminho do executável; no Windows, pnpm global pode usar Node adjacente mesmo com PATH alterado. Preferir instalação suportada ou executar pnpm.cjs explicitamente com Node 24 local.
- Banco ausente: readiness no bootstrap mostra `not_configured`; não significa persistência validada. Configurar URL e testar integração.
- Banco configurado indisponível: readiness deve ser 503; verificar conexão, credencial e health do banco sem publicar segredo.
- E2E: construir web/API primeiro; verificar se 3000/3001 estão livres e se browser foi instalado. Não encerrar processos alheios para liberar porta.
- Erro de dependência: preservar lockfile; identificar peer incompatível e registrar escolha. Não usar ignore de peer dependencies como solução automática.
- Hooks: Husky exige instalação de dependências; hooks locais são complementares ao CI, não fronteira de segurança.

Configuração `.env` não é versionada. API lê `.env` da raiz nos scripts preparados; frontend usa API_BASE_URL do ambiente ou default local. Para mudar o upstream da web, exportar API_BASE_URL no shell antes de iniciar Next.

## Sessões BFF

Exporte as quatro OIDC_* e API_BASE_URL no shell, junto de BFF_APP_ORIGIN=http://127.0.0.1:3000 e BFF_DATABASE_URL apontando para banco local migrado. Configure BFF_SESSION_ENCRYPTION_KEY com 32 bytes aleatórios em hexadecimal, sem publicar a chave. Next não carrega o .env da raiz; alternativamente configure apps/web/.env.local, ignorado pelo Git. Todos os processos BFF precisam da mesma chave. Em produção, use credencial restrita a auth_bff; sem fallback para DATABASE_URL.

No PowerShell, uma chave local pode ser gerada sem sa?da no terminal:

```powershell
$taskSessionKey = New-Object byte[] 32
$taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$taskRng.GetBytes($taskSessionKey)
$taskRng.Dispose()
$env:BFF_SESSION_ENCRYPTION_KEY = ([BitConverter]::ToString($taskSessionKey)).Replace('-', '').ToLowerInvariant()
```

Aplique `pnpm db:migrate` com DATABASE_URL local explícita antes do uso. Para a jornada automatizada, use exclusivamente TEST_DATABASE_URL com nome de banco terminado em _test, Keycloak local em 8080 e KEYCLOAK_ADMIN_PASSWORD. Execute build e migration nesse banco isolado, depois `pnpm test:e2e:auth`. O runner gera sua própria chave e usuário temporários; não utiliza usuários reais. Portas 3000/3001 devem estar livres. [Contrato](../adr/0007-bff-session-storage.md) e [validação](bff-session-validation.md).
