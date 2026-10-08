# Identity and Access

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Autenticar e verificar permissões, sem interpretar tributos.

## Entidades e regras propostas

User, Identity, Role. Issuer e audience verificados; credenciais nunca expostas. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Login → associação → verificação de ação. Interfaces: Provedor OIDC; Organizations por membership. Eventos propostos: IdentityLinked, AccessRevoked; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Bypass de acesso, sessão obsoleta. Não possui documentos nem aceita tenant de payload.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
