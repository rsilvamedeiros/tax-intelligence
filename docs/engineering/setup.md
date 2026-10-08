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

## Diagnóstico de falhas

- Engine incompatível: conferir `node --version` e caminho do executável; no Windows, pnpm global pode usar Node adjacente mesmo com PATH alterado. Preferir instalação suportada ou executar pnpm.cjs explicitamente com Node 24 local.
- Banco ausente: readiness no bootstrap mostra `not_configured`; não significa persistência validada. Configurar URL e testar integração.
- Banco configurado indisponível: readiness deve ser 503; verificar conexão, credencial e health do banco sem publicar segredo.
- E2E: construir web/API primeiro; verificar se 3000/3001 estão livres e se browser foi instalado. Não encerrar processos alheios para liberar porta.
- Erro de dependência: preservar lockfile; identificar peer incompatível e registrar escolha. Não usar ignore de peer dependencies como solução automática.
- Hooks: Husky exige instalação de dependências; hooks locais são complementares ao CI, não fronteira de segurança.

Configuração `.env` não é versionada. API lê `.env` da raiz nos scripts preparados; frontend usa API_BASE_URL do ambiente ou default local. Para mudar o upstream da web, exportar API_BASE_URL no shell antes de iniciar Next.
