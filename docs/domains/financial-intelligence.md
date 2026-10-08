# Financial Intelligence

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Relacionar indicadores financeiros e achados revisados.

## Entidades e regras propostas

FinancialPeriod, CashFlowSnapshot, Indicator. Precisão decimal, origem e revisão de impacto. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Fonte autorizada → normalização → indicador. Interfaces: ERP e Tax; Analytics por read model. Eventos propostos: FinancialSnapshotImported, IndicatorCalculated; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Confundir hipótese de economia com resultado realizado. Não substituir tesouraria ou escrituração.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
