---
name: database-design
description: Avaliar schema, constraints, índices e migrations PostgreSQL para dados autorizados.
---

# Objetivo e uso

Avaliar schema, constraints, índices e migrations PostgreSQL para dados autorizados.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/architecture/persistence.md](../../../docs/architecture/persistence.md) ao executar esta tarefa.

## Entradas

Modelo autorizado, consultas e transações necessárias.

## Instruções

Revise FKs compostas e unicidade por tenant. Planeje migration aditiva, backfill e rollback de aplicação; teste com role real. Não criar entidades da vertical antes de autorização.

## Checklist

Scope e RLS; precisão; pool; índice baseado em consulta.

## Saída

SQL/schema revisável, plano de migration e testes reais.
