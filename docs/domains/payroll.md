# Payroll

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Conciliar informações de folha com fontes autorizadas.

## Entidades e regras propostas

PayrollPeriod, PayrollSummary. Sem PII salarial real no MVP; precisão e competência explícitas. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Arquivo autorizado → validação → conciliação. Interfaces: ERP/folha via Integrations; eSocial por contrato. Eventos propostos: PayrollImported, PayrollReconciled; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Dados sensíveis, competência incorreta. Não substitui sistema de processamento de folha.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
