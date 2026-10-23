# Documentação TAX INTELLIGENCE

- [Interface de diagnóstico sintético](engineering/synthetic-diagnostic-ui-validation.md)
- [ADR 0027](adr/0027-synthetic-diagnostic-ui.md)

- [BFF de diagnóstico sintético](engineering/synthetic-diagnostic-bff-validation.md)
- [ADR 0026](adr/0026-synthetic-diagnostic-bff.md)

- [API de diagnóstico sintético](engineering/synthetic-diagnostic-http-validation.md)
- [ADR 0025](adr/0025-synthetic-diagnostic-http.md)

Documentação primeiro; código avança por etapa com aceite, testes e revisão. **Decisão registrada** é escolha técnica desta etapa; **proposta** aguarda avaliação/autorização; **hipótese** precisa de evidência; **pendência** ainda sem resolução. Nenhum estado equivale a aprovação de produção.

## Produto

- [strategy](product/strategy.md)

## Arquitetura

- [overview](architecture/overview.md)
- [api](architecture/api.md)
- [frontend](architecture/frontend.md)
- [persistence](architecture/persistence.md)
- [evolution](architecture/evolution.md)

## Engenharia

- [Status do projeto](engineering/project-status.md)

- [repository assessment](engineering/repository-assessment.md)
- [workflow](engineering/workflow.md)
- [testing](engineering/testing.md)
- [setup](engineering/setup.md)
- [delivery](engineering/delivery.md)
- [validation](engineering/validation.md)
- [validação do bootstrap](engineering/bootstrap-validation.md)
- [Plano de testes de identidade e isolamento](engineering/identity-tenancy-test-plan.md)
- [Validação da autenticação da API](engineering/authentication-validation.md)
- [Validação das sessões BFF](engineering/bff-session-validation.md)
- [Validação da consulta de memberships](engineering/membership-validation.md)
- [Validação da seleção de organização](engineering/browser-organization-validation.md)
- [Validação da revogação administrativa](engineering/membership-revocation-validation.md)
- [Validação da alteração de papéis](engineering/membership-role-validation.md)
- [Validação da concessão administrativa](engineering/membership-grant-validation.md)
- [Validação da consulta administrativa de membros](engineering/administrative-membership-directory-validation.md)
- [Validação do BFF administrativo](engineering/administrative-membership-bff-validation.md)
- [Validação da interface administrativa](engineering/administrative-membership-ui-validation.md)
- [Plano de TDD da prova RLS](engineering/synthetic-rls-test-plan.md)
- [Validação da proposta RLS](engineering/rls-proposal-validation.md)
- [Validação da prova sintética RLS](engineering/synthetic-rls-validation.md)
- [Plano proposto do primeiro lote sintético](engineering/synthetic-document-intake-test-plan.md)
- [Validação do contrato do lote sintético](engineering/synthetic-document-contract-validation.md)
- [Validação da persistência do lote sintético](engineering/synthetic-document-persistence-validation.md)
- [Validação da API do lote sintético](engineering/synthetic-document-http-validation.md)
- [Validação do BFF do lote sintético](engineering/synthetic-document-bff-validation.md)
- [Validação da interface do lote sintético](engineering/synthetic-document-ui-validation.md)
- [Validação do núcleo de diagnóstico sintético](engineering/synthetic-diagnostic-core-validation.md)
- [Plano proposto de TDD da execução de diagnóstico](engineering/synthetic-diagnostic-execution-test-plan.md)
- [Validação dos casos de uso da execução sintética](engineering/synthetic-diagnostic-use-cases-validation.md)
- [Validação da persistência da execução sintética](engineering/synthetic-diagnostic-persistence-validation.md)

## Domínios

- [context map](domains/context-map.md)

## Integrações, segurança e IA

- [feasibility](integrations/feasibility.md)
- [security model](security/security-model.md)
- [Threat model de identidade e isolamento](security/identity-tenancy-threat-model.md)
- [playbook](ai/playbook.md)

## Decisões

- [0001 modular monolith](adr/0001-modular-monolith.md)
- [0002 postgresql drizzle](adr/0002-postgresql-drizzle.md)
- [0003 tenant isolation](adr/0003-tenant-isolation.md)
- [0004 ai and fiscal rules](adr/0004-ai-and-fiscal-rules.md)
- [0005 toolchain do bootstrap](adr/0005-bootstrap-toolchain.md)
- [0006 provedor de desenvolvimento e autenticação da API](adr/0006-development-identity-provider.md)
- [0007 armazenamento de sessões BFF](adr/0007-bff-session-storage.md)
- [0008 consulta de organizações e memberships](adr/0008-membership-directory.md)
- [0009 seleção de organização no navegador](adr/0009-browser-organization-selection.md)
- [0010 revogação administrativa de membership](adr/0010-membership-revocation.md)
- [0011 alteração administrativa de papéis](adr/0011-membership-role-changes.md)
- [0012 concessão administrativa de memberships](adr/0012-membership-grants.md)
- [0013 consulta administrativa de membros](adr/0013-administrative-membership-directory.md)
- [0014 BFF administrativo de memberships](adr/0014-administrative-membership-bff.md)
- [0015 Interface administrativa de membros](adr/0015-administrative-membership-ui.md)
- [0016 Prova sintética RLS](adr/0016-synthetic-rls-proof.md)
- [0017 Contrato do lote sintético](adr/0017-synthetic-document-contract.md)
- [0018 Persistência do lote sintético](adr/0018-synthetic-document-persistence.md)
- [0019 API do lote sintético](adr/0019-synthetic-document-http.md)
- [0020 BFF do lote sintético](adr/0020-synthetic-document-bff.md)
- [0021 Interface do lote sintético](adr/0021-synthetic-document-ui.md)
- [0022 Núcleo do diagnóstico demonstrativo](adr/0022-synthetic-diagnostic-core.md)
- [0023 Contratos e casos de uso da execução sintética](adr/0023-synthetic-diagnostic-use-cases.md)
- [0024 Persistência da execução sintética](adr/0024-synthetic-diagnostic-persistence.md)
- [process](rfc/process.md)
- [RFC 0001: identidade, membership e isolamento](rfc/0001-identity-membership-isolation.md)
- [RFC 0002: prova sintética RLS](rfc/0002-synthetic-rls-proof.md)
- [RFC 0003: primeiro lote de documentos sintéticos](rfc/0003-synthetic-document-intake.md)
- [RFC 0004: execução registrada do diagnóstico sintético](rfc/0004-synthetic-diagnostic-execution.md)

## Roadmap

- [plan](roadmap/plan.md)
- [first vertical](roadmap/first-vertical.md)

## Operação e agentes

- [AGENTS](../AGENTS.md) e [contribuição](../CONTRIBUTING.md)
- [Skills e política de IA](ai/playbook.md)
- [Observabilidade](../infrastructure/observability/README.md)
- [Planejamento Terraform](../infrastructure/terraform/README.md)
- [Reporte de segurança](../SECURITY.md)
