# eSocial

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Modelar eventos, versões e retornos quando homologado.

## Entidades e regras propostas

LaborEvent, EventReceipt, EventLayout. Leiaute e ambiente explícitos; assinatura conforme fonte oficial. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Fonte autorizada → evento validado → retorno correlacionado. Interfaces: Payroll, SST e conector oficial futuro. Eventos propostos: LaborEventValidated, LaborEventRejected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Certificado, versão de schema, duplicação de envio. Não presumir acesso ou transmissão autorizada.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
