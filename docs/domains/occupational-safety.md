# Occupational Safety / SST

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Conciliar evidências ocupacionais com acesso restrito.

## Entidades e regras propostas

SafetyEvidence, OccupationalEvent. Minimização e permissão adicional para dados sensíveis. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Fonte SST → validação → evidência restrita. Interfaces: Provedor SST; eSocial por contrato. Eventos propostos: SafetyEvidenceImported, SafetyEventValidated; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Dados de saúde e acesso excessivo. Não produzir diagnóstico médico ou prontuário clínico.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
