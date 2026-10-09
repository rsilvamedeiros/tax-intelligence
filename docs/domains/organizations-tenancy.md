# Organizations and Tenancy

Status: consulta autenticada, seleção BFF/UI e revogação administrativa com auditoria/locks implementadas conforme ADRs [0008](../adr/0008-membership-directory.md), [0009](../adr/0009-browser-organization-selection.md) e [0010](../adr/0010-membership-revocation.md). Alteração administrativa de papéis está implementada no [ADR 0011](../adr/0011-membership-role-changes.md), compartilhando auditoria/locks com revogação. Concessão de vínculos, administração no navegador e RLS permanecem propostos.

## Objetivo e responsabilidades

Manter organizações e associação de atores.

## Entidades e regras propostas

Organization, Membership. Associação ativa e papel válido; revogação efetiva. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Selecionar organização → validar associação. Interfaces: Identity; todos os casos de uso tenant-owned. Eventos propostos: MembershipGranted, MembershipRevoked; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Organization e Membership possuem tabelas com FKs, unicidade e role limitada. Consultas filtram ator por issuer/subject e vínculos ativos, sem cache. A próxima consulta após commit da revogação nega acesso; leitura iniciada antes pode concluir pelo snapshot. Revogação exige administrador ativo, locks, preservação do último administrador e evento na mesma transação. Auditoria referencia iniciador/alvo na organização por FKs compostas, sem identidade externa. Outros efeitos transacionais continuam propostos na [RFC 0001](../rfc/0001-identity-membership-isolation.md). Não há policies RLS ou dados fiscais nesta entrega.

Acesso cruzado, contexto de pool reutilizado. Não centralizar tabelas de domínio neste contexto.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
