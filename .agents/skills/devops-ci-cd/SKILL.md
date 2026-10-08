---
name: devops-ci-cd
description: Preparar checks reproduzíveis e entrega controlada por etapa sem deploy não autorizado.
---

# Objetivo e uso

Preparar checks reproduzíveis e entrega controlada por etapa sem deploy não autorizado.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/engineering/delivery.md](../../../docs/engineering/delivery.md) ao executar esta tarefa.

## Entradas

Scripts, lockfile, ambiente e checks exigidos.

## Instruções

Fixe runtime/package manager; install frozen. Execute checks aplicáveis e registre bloqueios. Prepare controles de release sem alterar segurança remota nem provisionar cloud.

## Checklist

Permissões mínimas; cache correto; banco isolado; rollback.

## Saída

Workflow revisável, evidências e required checks propostos.
