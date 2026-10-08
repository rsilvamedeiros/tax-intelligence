# Validação do bootstrap técnico

Etapa posterior ao PR documental #1, integrado à main em `3aa9042`. Ambiente local: Windows/PowerShell, Node 24.21.0 local, pnpm 10.24.0, Chrome 152 e PostgreSQL 18.1. Instância PostgreSQL de teste criada exclusivamente em `.local`, ligada a 127.0.0.1:55432; não usa o cluster/banco existente. CI usa PostgreSQL 17 descartável, conforme arquitetura.

## Critérios e evidências locais — 08/10/2026

| Comando/verificação                        | Resultado observado                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm lint`                                | Aprovado após ajustar configuração CJS e versão ESLint                                 |
| `pnpm typecheck`                           | Aprovado; Cypress também recebe configuração strict própria                            |
| `pnpm test:coverage`                       | 42 testes de contratos, HTTP/configuração e componentes/proxy; aprovados               |
| Cobertura de linhas do código selecionado  | Contratos 100%; API 97,56%; web 100%; metas preservadas                                |
| `pnpm build`                               | Frontend Next e API Nest compilados; página e proxy gerados                            |
| `pnpm db:migrate`                          | Migration técnica executada no banco isolado                                           |
| `pnpm test:integration`                    | 2 testes PostgreSQL real: migration idempotente e rollback                             |
| `pnpm test:e2e`                            | 2 testes Cypress/Chrome: proxy real de readiness e recuperação de falha                |
| Smoke OTLP                                 | Span real exportado para collector local; sentinelas sensíveis ausentes em logs/traces |
| `pnpm audit --prod --audit-level=moderate` | Sem vulnerabilidades conhecidas                                                        |

Instalação `--frozen-lockfile`, lint, tipos incluindo Cypress, cobertura, build, smoke, formato e integração reconferidos antes dos commits. Validador documental aprovou 61 arquivos Markdown; YAML dos dois workflows e Compose foi parseado. Resultado do CI remoto será avaliado no PR; sua execução ainda não é presumida neste registro.

## Red → Green demonstrado nesta etapa

Antes de alterar o parser/filtro, dois testes falharam: JSON acima de 1 MiB retornava 500 em vez de 413; JSON de 200 KiB retornava 500 antes de alcançar a rota, em vez de 404. Correção: limite JSON explícito de 1 MiB e tradução restrita de `entity.too.large` para 413. Os dois casos e a correlação/privacidade de JSON malformado passaram depois. A API ficou com 23 testes aprovados.

Testes existentes do bootstrap foram escritos junto da preparação anterior e não são apresentados retroativamente como TDD. Falhas de configuração de runner/versões também não são Red de comportamento.

## Problemas corrigidos e revisão

- Runner incompatível com Nest 12 ESM: versões compatíveis selecionadas no [ADR 0005](../adr/0005-bootstrap-toolchain.md).
- Subpath Cypress privado: substituído pela API pública; interferência ELECTRON_RUN_AS_NODE removida no runner.
- E2E agora usa exclusivamente TEST_DATABASE_URL, nunca DATABASE_URL ou .env para persistência; sem banco de teste explícito, valida o modo bootstrap.
- Configurações CJS permitidas no lint, sem liberar any ou imports proibidos entre pacotes.
- Dependência runtime js-yaml corrigida com override restrito; achado moderado dev-only de sprintf-js permanece registrado, sem supressão.

Autorrevisão pelo agente autor; revisão humana pendente no PR. Não há autenticação, tenants funcionais, diagnóstico fiscal, audit trail de negócio ou integração homologada. Readiness sem banco é permitida apenas fora de produção; produção exige URL e origem HTTPS explícitas. Spans manuais são funcionais, mas propagação distribuída e backend de métricas seguem planejados. Axe cobre parte da acessibilidade; revisão manual ainda necessária antes de jornadas de negócio.
