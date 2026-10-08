# Audit and Compliance

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Registrar ações e evidências sem replicar dados sensíveis.

## Entidades e regras propostas

AuditEvent, RetentionPolicy. Write junto da transação quando síncrono; evento sem payload integral. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Ação → registro → consulta autorizada → retenção. Interfaces: Portas de auditoria dos casos de uso. Eventos propostos: AuditRecorded, RetentionApplied; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Alteração de log, retenção indevida, leitura excessiva. Não confundir log técnico com prova fiscal imutável.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
