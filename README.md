# tax-intelligence

Tax Intelligence Platform: fundação de uma plataforma B2B de inteligência tributária, fiscal, trabalhista e financeira sobre sistemas existentes.

**Etapa atual: proposta do primeiro lote sintético.** Login, sessões BFF, seleção de organização e administração de membros estão implementados; a prova RLS foi integrada na PR #19. A [RFC 0003](docs/rfc/0003-synthetic-document-intake.md) propõe o primeiro recurso de domínio com autorização, idempotência e auditoria, sem implementação autorizada. [Status do projeto](docs/engineering/project-status.md) e [evidências RLS](docs/engineering/synthetic-rls-validation.md). Importação, diagnóstico, regras reais e produção permanecem pendentes. Não houve deploy.

- [Documentação navegável](docs/README.md)
- [Avaliação do repositório e plano por etapas](docs/engineering/repository-assessment.md)
- [Produto e MVP](docs/product/strategy.md)
- [Arquitetura e limites](docs/architecture/overview.md)
- [TDD, testes](docs/engineering/testing.md) e [Git/PR/revisão](docs/engineering/workflow.md)
- [Setup local](docs/engineering/setup.md) e [evidências](docs/engineering/validation.md)
- [Backlog priorizado](docs/roadmap/plan.md)

Stack definida: pnpm/Turborepo, Next.js/React, NestJS, TypeScript strict e PostgreSQL/Drizzle. Começar com monólito modular; evolução depende de critérios medidos. Contribuições seguem [CONTRIBUTING](CONTRIBUTING.md), agentes seguem [AGENTS](AGENTS.md), problemas de segurança seguem [SECURITY](SECURITY.md).

Documentação usa português brasileiro; código e mensagens de commit usam inglês. [Changelog](CHANGELOG.md).
