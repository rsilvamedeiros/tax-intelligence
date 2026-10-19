# Validação da prova sintética RLS

Escopo: [ADR 0016](../adr/0016-synthetic-rls-proof.md). Base: PR #18 integrada, main `ee9e2fc`. [Plano de testes](synthetic-rls-test-plan.md).

## Plano

Documentação e AGENTS antes do teste. Provisionar fixture/login isolados com PostgreSQL real; observar Red de leitura sem RLS antes de aplicar policies, depois escritas e tratamento de conexão por comportamento. Executar os 12 cenários e a integração completa. Separar checks efetivamente executados de planos; conferir cleanup, CI, GitGuardian e revisão independente antes da entrega.

## Evidências

Testes e implementação ainda pendentes. Esta etapa não habilita RLS no runtime da aplicação nem conclui DB-03 ou a primeira vertical. Atualizar [status do projeto](project-status.md) com resultados reais, sem percentual arbitrário.
