# ADR 0002 — PostgreSQL e Drizzle

Data: 08/10/2026. Status: Decisão técnica registrada nesta etapa; revisão humana pendente.

## Contexto

Persistência precisa de transações, constraints, SQL revisável e caminho para RLS multi-tenant.

## Decisão

PostgreSQL 17 e Drizzle para consultas tipadas; migrations SQL versionadas pelo migrador Drizzle. Schema inicial estritamente técnico.

## Alternativas

Prisma oferece modelagem declarativa e cliente gerado, mas adiciona geração e exige SQL adicional para RLS. Drizzle mantém SQL explícito e menor superfície para esta fundação. Nenhum é intrinsecamente seguro sem constraints/escopo.

## Consequências

Equipe precisa revisar SQL, migrations e pool. Drizzle Kit não será adicionado até schema de negócio justificar geração. Não usar push de schema em produção.

Referências: [arquitetura](../architecture/overview.md), [persistência](../architecture/persistence.md), [evolução](../architecture/evolution.md), [vertical](../roadmap/first-vertical.md).
