# Fiscal Compliance

Status: contrato inicial e preparação pura implementados no [ADR 0017](../adr/0017-synthetic-document-contract.md); persistência normalizada com RLS somente nas relações do lote sintético implementada no [ADR 0018](../adr/0018-synthetic-document-persistence.md). RLS das tabelas de controle continua pendente. Sem endpoint, diagnóstico ou fonte fiscal real; modelo restante proposto.

## Objetivo e responsabilidades

Normalizar fontes fiscais e controlar validação estrutural.

## Entidades e regras propostas

FiscalDocument, ImportBatch, ValidationResult. Preservar origem/hash; idempotência por tenant. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Ingestão → validação → normalização → persistência. Interfaces: Integrations; Tax por representação estável. Eventos propostos: DocumentImported, DocumentRejected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

XML malicioso, leiaute incompatível, duplicação. Não decide oportunidade tributária nem cria API oficial fictícia.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
