# Documentação TAX INTELLIGENCE

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
- [process](rfc/process.md)
- [RFC 0001: identidade, membership e isolamento](rfc/0001-identity-membership-isolation.md)

## Roadmap

- [plan](roadmap/plan.md)
- [first vertical](roadmap/first-vertical.md)

## Operação e agentes

- [AGENTS](../AGENTS.md) e [contribuição](../CONTRIBUTING.md)
- [Skills e política de IA](ai/playbook.md)
- [Observabilidade](../infrastructure/observability/README.md)
- [Planejamento Terraform](../infrastructure/terraform/README.md)
- [Reporte de segurança](../SECURITY.md)
