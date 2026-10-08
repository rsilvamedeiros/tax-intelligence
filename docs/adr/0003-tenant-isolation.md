# ADR 0003 — Isolamento por tenant

Data: 08/10/2026. Status: Proposta; depende de autorização da fase 5.

## Contexto

Dados fiscais/trabalhistas de clientes distintos não podem compartilhar acesso por erro de filtro.

## Decisão

Proposta para fase 5: shared database/shared schema, tenant obrigatório, membership server-side, FKs compostas e RLS com contexto por transação e role restrita.

## Alternativas

Banco por tenant melhora segregação operacional, mas multiplica migrations/backup/custo antes de requisitos contratuais. Filtro de aplicação sozinho não oferece defesa adicional contra omissão.

## Consequências

Nenhum controle de tenancy está implementado. Aceitação final depende de ameaça, autenticação e teste real de pool/RLS. Não criar modelo nesta etapa.

Referências: [arquitetura](../architecture/overview.md), [persistência](../architecture/persistence.md), [evolução](../architecture/evolution.md), [vertical](../roadmap/first-vertical.md).
