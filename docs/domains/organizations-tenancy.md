# Organizations and Tenancy

Status: consulta autenticada de organizações/memberships e seleção no BFF/UI implementadas conforme [ADR 0008](../adr/0008-membership-directory.md) e [ADR 0009](../adr/0009-browser-organization-selection.md). Administração, auditoria e isolamento RLS permanecem propostos.

## Objetivo e responsabilidades

Manter organizações e associação de atores.

## Entidades e regras propostas

Organization, Membership. Associação ativa e papel válido; revogação efetiva. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Selecionar organização → validar associação. Interfaces: Identity; todos os casos de uso tenant-owned. Eventos propostos: MembershipGranted, MembershipRevoked; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Organization e Membership possuem tabelas com FKs, unicidade e role limitada. As consultas são filtradas pelo ator resolvido por issuer/subject, ignoram vínculos revogados e não usam cache de autorização. A próxima consulta após commit da revogação nega acesso; uma leitura iniciada antes pode concluir pelo snapshot. Administração, autorização por ação e locks para efeitos transacionais continuam propostos na [RFC 0001](../rfc/0001-identity-membership-isolation.md). Não há policies RLS nem dados de negócio nesta entrega.

Acesso cruzado, contexto de pool reutilizado. Não centralizar tabelas de domínio neste contexto.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
