# Validação do contrato de lote sintético

Escopo: [ADR 0017](../adr/0017-synthetic-document-contract.md), após PR #20 integrada. Plano: schemas/runtime e OpenAPI compartilhados, representação canônica pura e testes Red/Green antes da implementação. [Matriz da vertical](synthetic-document-intake-test-plan.md): esta entrega cobre contrato e preparação do comando, sem concluir idempotência persistida ou qualquer negativo de tenant.

## Evidências

Execução em andamento. Registrar testes e comandos efetivamente executados antes da entrega; os demais casos da matriz permanecem planejados. Não alegar HTTP, PostgreSQL ou UI com base em testes puros.
