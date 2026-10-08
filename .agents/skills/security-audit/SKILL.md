---
name: security-audit
description: Avaliar ameaças e controles de autorização, isolamento, uploads, segredos e privacidade.
---

# Objetivo e uso

Avaliar ameaças e controles de autorização, isolamento, uploads, segredos e privacidade.

Consulte [AGENTS](../../../AGENTS.md) para invariantes e autorização; leia [docs/security/security-model.md](../../../docs/security/security-model.md) ao executar esta tarefa.

## Entradas

Fronteiras, fluxo de dados, diff e ambiente autorizado.

## Instruções

Confronte ameaça com evidência executável; priorize exposição entre tenants e secrets. Nunca explorar ambiente externo sem autorização ou usar dados reais em fixture.

## Checklist

Membership server-side; SQL/RLS; redaction; credenciais/retention.

## Saída

Achados classificados, mitigação e testes de regressão.
