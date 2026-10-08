# Organizations and Tenancy

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Manter organizações e associação de atores.

## Entidades e regras propostas

Organization, Membership. Associação ativa e papel válido; revogação efetiva. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Selecionar organização → validar associação. Interfaces: Identity; todos os casos de uso tenant-owned. Eventos propostos: MembershipGranted, MembershipRevoked; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Acesso cruzado, contexto de pool reutilizado. Não centralizar tabelas de domínio neste contexto.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
