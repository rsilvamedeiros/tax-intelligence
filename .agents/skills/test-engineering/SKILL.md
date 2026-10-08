---
name: test-engineering
description: Definir testes significativos de contrato, integração, concorrência e jornadas conforme o risco.
---

# Objetivo e uso

Definir testes significativos de contrato, integração, concorrência e jornadas conforme o risco.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/engineering/testing.md](../../../docs/engineering/testing.md) ao executar esta tarefa.

## Entradas

Comportamento, dependências e riscos de regressão.

## Instruções

Escolha menor camada que demonstre comportamento; banco real para constraints/RLS, mocks apenas na fronteira externa. Use fixtures sintéticas e tempo controlado.

## Checklist

Casos negativos; determinismo; integração não substituída por mocks.

## Saída

Matriz de casos e execução com limites reais reportados.
