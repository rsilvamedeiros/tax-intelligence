# TAX INTELLIGENCE — instruções do repositório

Plataforma B2B de inteligência sobre fontes fiscais, tributárias, trabalhistas e financeiras. Documentação em pt-BR; código e identificadores em inglês. Base: pnpm/Turborepo, Node 24 LTS, Next.js/React, NestJS 11, TypeScript strict, PostgreSQL/Drizzle. Fundação operacional com endpoints de health e testes; veja [validação técnica](docs/engineering/bootstrap-validation.md). Sem ERP novo ou cálculo fiscal inventado.

## Contexto obrigatório

Leia [índice](docs/README.md), [arquitetura](docs/architecture/overview.md), ADRs e documentos do contexto afetado. Preserve trabalho local e Git existente. Comece por status/diff, scripts, dependências e estado do ambiente. Registre plano proporcional, riscos e critérios de aceite antes de editar.

Estado autorizado: documentação primeiro; fundação técnica por etapa. Após PR #5, o mantenedor delegou a escolha do provedor e a autenticação da API; após PR #6, autorizou login e sessões BFF. Após PR #8, autorizou a próxima etapa de memberships, delimitada no ADR 0008. Importação, regras e isolamento de dados de negócio permanecem pendentes de etapa própria. Não transformar proposta em decisão aprovada silenciosamente.

Etapa atual autorizada após PR #8: consulta autenticada de organizações e memberships conforme [ADR 0008](docs/adr/0008-membership-directory.md). Administração com auditoria/locks, RLS e seleção BFF/UI seguem pendentes; consultar RFC 0001, threat model e matriz de TDD antes de ampliar o escopo.

## Arquitetura e código

- Monólito modular; presentation → application → domain; infrastructure implementa portas. Domain independente de React, Nest e ORM.
- Web usa ui/contracts; API usa contracts/database; contratos não importam infraestrutura; contextos não acessam internals/tabelas de outros.
- Exceção BFF autorizada no [ADR 0007](docs/adr/0007-bff-session-storage.md): somente apps/web/server/auth/runtime.ts, com server-only, acessa database para sessões técnicas via BFF_DATABASE_URL. React não acessa banco. Consulta de memberships pertence à API; nenhuma ampliação do acesso ao banco pela web está autorizada.
- SOLID/KISS/DRY/YAGNI e DDD pragmático. Value objects e abstrações apenas com invariantes/consumidores reais.
- Não usar any sem justificativa localizada, dependências circulares, regras fiscais em React, service mesh, Kubernetes, microfrontends ou microsserviços antecipados.
- API /v1, validação runtime de transporte, erro padronizado e request ID. Dinheiro exato; regra real com fonte, vigência, jurisdição, versão e evidência.

## Trabalho e testes

Entenda tarefa → identifique contexto → consulte docs/ADRs → planeje aceite/riscos → escreva teste quando aplicável → observe Red válido → implemente mínimo → Green → refatore → valide → revise diff → atualize docs → reporte evidências.

Siga [TDD](docs/engineering/testing.md). Não afirmar TDD se testes foram escritos depois da implementação. Não remover teste/reduzir cobertura para passar. Testes de persistência usam PostgreSQL real isolado via TEST_DATABASE_URL; mocks só nas fronteiras apropriadas. Dados sintéticos. Testes negativos de autorização/tenant são bloqueantes quando o domínio for implementado. Documentação é validada por links, formato e coerência, sem testes artificiais de conteúdo textual.

Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `pnpm test:integration`, `pnpm build`, `pnpm test:smoke`, `pnpm test:e2e`, `pnpm format:check`, `pnpm audit:dependencies`. Integração exige TEST_DATABASE_URL; E2E usa apenas essa URL e nunca .env/DATABASE_URL. Smoke e E2E exigem build prévio; Chrome é o browser padrão. Validação documental independente: `node scripts/validate-docs.mjs`. Antes de executar, confira se ambiente e scripts estão disponíveis; falha/bloqueio deve constar no relatório. Nunca declarar aprovação sem execução.

## Segurança e IA

Sem segredos versionados, PII real em fixtures/prompts/logs, scraping autenticado presumido, APIs governamentais fictícias ou decisão tributária definitiva por LLM. Autorização pertence aos casos de uso; tenant vem de membership verificada; RLS ainda é proposta. Leia [segurança](docs/security/security-model.md) e [playbook](docs/ai/playbook.md).

## Git, PR e autonomia

Siga [workflow](docs/engineering/workflow.md). Commits por módulo/entrega coerente com mensagem curta em inglês: feat, fix, chore, docs ou test; sem corpo, descrição, assinatura de IA ou Co-Authored-By. Preserve user.name/user.email configurados. Não criar commits quebrados apenas para separar teste e implementação.

Títulos e descrições de PR, além dos comentários de revisão publicados, em inglês. Descrições concisas: problema e resultado em uma ou duas frases, validação executada e riscos relevantes. Evitar histórico da conversa, listas repetidas e seções sem conteúdo aplicável. Documentação do produto e engenharia permanece em pt-BR.

Autorização vigente: executar commits separados desta entrega após checks e revisão, incluindo AGENTS e skills; abrir PR conforme solicitado, com push apenas da branch correspondente. Não pedir novamente confirmação para esses commits. Autorizações futuras podem ajustar o fluxo. PR automático autorizado não significa merge automático. A etapa de negócio continua exigindo confirmação própria. Não fazer deploy, alterar segurança remota ou transmitir obrigação sem autorização específica. Não delegar para agentes sem autorização aplicável.

Revisão: estática, segurança, arquitetura, IA e humana. IA reporta evidência e severidade; não aprova mudança crítica automaticamente. [DoR/DoD](docs/engineering/workflow.md) e template de PR devem ser observados. Não afirmar revisão independente quando só houve autorrevisão.

Skills reutilizáveis em `.agents/skills`; leia apenas a adequada. Mudanças arquiteturais exigem ADR/RFC e critérios de evolução. Relatório final: mudança, motivo, testes/comandos, resultados reais, riscos/limites e próximo ponto de decisão.
