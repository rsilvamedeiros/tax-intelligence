---
name: observability
description: Instrumentar operações com logs e traces de campos permitidos sem dados sensíveis.
---

# Objetivo e uso

Instrumentar operações com logs e traces de campos permitidos sem dados sensíveis.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [infrastructure/observability/README.md](../../../infrastructure/observability/README.md) ao executar esta tarefa.

## Entradas

Operação, orçamento de latência e campos permitidos.

## Instruções

Use route template e request ID validado. Revise atributos antes de exporter; não capture corpo, query ou headers. Métricas sem labels tenant/document.

## Checklist

Baixa cardinalidade; nenhum segredo; modo opt-in; shutdown.

## Saída

Instrumentação mínima, teste de sentinelas e indicadores definidos.
