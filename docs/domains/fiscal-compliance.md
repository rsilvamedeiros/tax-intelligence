# Fiscal Compliance

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Normalizar fontes fiscais e controlar validação estrutural.

## Entidades e regras propostas

FiscalDocument, ImportBatch, ValidationResult. Preservar origem/hash; idempotência por tenant. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Ingestão → validação → normalização → persistência. Interfaces: Integrations; Tax por representação estável. Eventos propostos: DocumentImported, DocumentRejected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

XML malicioso, leiaute incompatível, duplicação. Não decide oportunidade tributária nem cria API oficial fictícia.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
