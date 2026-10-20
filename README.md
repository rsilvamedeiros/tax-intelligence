# tax-intelligence

Tax Intelligence Platform: fundação de uma plataforma B2B de inteligência tributária, fiscal, trabalhista e financeira sobre sistemas existentes.

**Etapa atual: persistência do lote sintético.** Migration aditiva, autorização transacional, auditoria e RLS nas novas tabelas implementados conforme [ADR 0018](docs/adr/0018-synthetic-document-persistence.md), com pool dedicado injetado e contratos do ADR 0017. Login e administração de membros permanecem implementados. [Status do projeto](docs/engineering/project-status.md) e [validação](docs/engineering/synthetic-document-persistence-validation.md). Endpoints/API do lote, diagnóstico, interface e produção continuam pendentes. Não houve deploy.

- [Documentação navegável](docs/README.md)
- [Avaliação do repositório e plano por etapas](docs/engineering/repository-assessment.md)
- [Produto e MVP](docs/product/strategy.md)
- [Arquitetura e limites](docs/architecture/overview.md)
- [TDD, testes](docs/engineering/testing.md) e [Git/PR/revisão](docs/engineering/workflow.md)
- [Setup local](docs/engineering/setup.md) e [evidências](docs/engineering/validation.md)
- [Backlog priorizado](docs/roadmap/plan.md)

Stack definida: pnpm/Turborepo, Next.js/React, NestJS, TypeScript strict e PostgreSQL/Drizzle. Começar com monólito modular; evolução depende de critérios medidos. Contribuições seguem [CONTRIBUTING](CONTRIBUTING.md), agentes seguem [AGENTS](AGENTS.md), problemas de segurança seguem [SECURITY](SECURITY.md).

Documentação usa português brasileiro; código e mensagens de commit usam inglês. [Changelog](CHANGELOG.md).
