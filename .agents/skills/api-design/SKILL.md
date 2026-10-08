---
name: api-design
description: Definir contrato REST versionado com validação, autorização e erros antes de controllers.
---

# Objetivo e uso

Definir contrato REST versionado com validação, autorização e erros antes de controllers.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/architecture/api.md](../../../docs/architecture/api.md) ao executar esta tarefa.

## Entradas

Caso de uso, consumidor, payload e permissões.

## Instruções

Especifique status/schemas e limites; tenant deriva de associação. Defina idempotência para escrita e contrato de erro seguro. Atualize OpenAPI e schema runtime juntos.

## Checklist

401/403/404; conflitos; campos desconhecidos; compatibilidade.

## Saída

Contrato, exemplos sintéticos e casos de teste.
