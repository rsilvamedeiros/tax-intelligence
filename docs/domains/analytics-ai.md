# Analytics and AI

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Produzir projeções de leitura e explicações com origem.

## Entidades e regras propostas

ReadModel, Explanation, EvaluationRun. Respeitar tenant na projeção; texto IA não altera achado. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Eventos aprovados → projeção → consulta. Interfaces: Contratos públicos de domínios; provider IA futuro. Eventos propostos: ReadModelUpdated, ExplanationGenerated; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Exfiltração em prompt, projeção atrasada. Não é fonte primária das regras nem contorna autorização.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
