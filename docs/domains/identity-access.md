# Identity and Access

Status: verificação criptográfica de access tokens, endpoint de identidade, sessões BFF e resolução do ator persistido implementados. Permissões de negócio permanecem propostas. [ADR 0006](../adr/0006-development-identity-provider.md), [ADR 0007](../adr/0007-bff-session-storage.md) e [ADR 0008](../adr/0008-membership-directory.md).

## Objetivo e responsabilidades

Autenticar e verificar permissões, sem interpretar tributos.

## Entidades e regras propostas

Actor é persistido por ID UUID e dupla única e exata issuer/subject. Login não cria ator automaticamente; e-mail não identifica nem concede associação. O adapter público de identidade resolve somente o ID, sem acessar tabelas privadas de organizações. Issuer e audience são verificados; credenciais nunca expostas. Permissões por ação aguardam casos de uso próprios.

## Fluxo e integrações

Login → associação → verificação de ação. Interfaces: Provedor OIDC; Organizations por membership. Eventos propostos: IdentityLinked, AccessRevoked; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Sessão BFF e lookup de ator estão implementados nas etapas dos ADRs 0007/0008. Consulta de organização valida membership ativa; administração e permissões de negócio da [RFC 0001](../rfc/0001-identity-membership-isolation.md) continuam pendentes.

Bypass de acesso, sessão obsoleta. Não possui documentos nem aceita tenant de payload.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
