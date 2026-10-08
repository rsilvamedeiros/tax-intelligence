# Infraestrutura como código: planejamento

Nenhum recurso cloud foi provisionado. Provedor, região, orçamento, ambientes e responsáveis pendentes. Antes de Terraform: ADR de hosting, desenho de rede, PostgreSQL gerenciado, backups/restore, secrets, TLS, observabilidade e custo estimado.

Estado remoto deve ser criptografado, com locking, acesso mínimo e separado por ambiente. CI fará fmt/validate/plan antes de aprovação humana para apply. Não inserir credenciais em tfvars versionado. Kubernetes não é requisito. [Estratégia de entrega](../../docs/engineering/delivery.md).
