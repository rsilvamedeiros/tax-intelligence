---
name: performance-engineering
description: Medir latência e gargalos antes de otimizar consultas, cache ou processamento.
---

# Objetivo e uso

Medir latência e gargalos antes de otimizar consultas, cache ou processamento.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/product/strategy.md](../../../docs/product/strategy.md) ao executar esta tarefa.

## Entradas

Carga reproduzível, ambiente, baseline e SLO proposto.

## Instruções

Use fixture sintética e parâmetros registrados. Meça p95, erros e recursos; compare uma mudança por vez. Cache só com política de tenant/invalidação.

## Checklist

Sem dados reais; regressão funcional; custo; SLO não inventado.

## Saída

Benchmark reproduzível, comparação e decisão baseada em evidência.
