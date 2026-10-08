---
name: tdd-workflow
description: Executar Red Green Refactor por comportamento em uma etapa autorizada.
---

# Objetivo e uso

Executar Red Green Refactor por comportamento em uma etapa autorizada.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/engineering/testing.md](../../../docs/engineering/testing.md) ao executar esta tarefa.

## Entradas

Aceite observável e fronteira sob teste.

## Instruções

Escreva um teste que falhe pela capacidade ausente. Execute Red e registre motivo, implemente mínimo e execute Green; refatore sem alterar contrato.

## Checklist

Falha legítima; não espelha implementação; regressão e riscos cobertos.

## Saída

Teste, implementação mínima e evidências Red/Green.
