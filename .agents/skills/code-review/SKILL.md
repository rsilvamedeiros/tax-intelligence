---
name: code-review
description: Revisar diff buscando bugs, regressões, segurança e quebra de contrato com evidência.
---

# Objetivo e uso

Revisar diff buscando bugs, regressões, segurança e quebra de contrato com evidência.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/engineering/workflow.md](../../../docs/engineering/workflow.md) ao executar esta tarefa.

## Entradas

Diff, critério de aceite, ADRs e resultados dos checks.

## Instruções

Procure caminho concreto de falha e testes negativos. Classifique achados; distinga suspeita de bug confirmado. Não aprovar código crítico automaticamente.

## Checklist

Tenant/autorização; dados/migrations; sem ruído cosmético.

## Saída

Achados com severidade, arquivo/linha, evidência, impacto e sugestão.
