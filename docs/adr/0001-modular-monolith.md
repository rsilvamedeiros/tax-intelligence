# ADR 0001 — Monorepo e monólito modular

Data: 08/10/2026. Status: Decisão técnica registrada nesta etapa; revisão humana pendente.

## Contexto

Aplicar direção arquitetural explicitamente solicitada sem distribuir dados/processos por domínio.

## Decisão

pnpm/Turborepo, NestJS modular, Next.js e pacotes públicos. Contextos se comunicam por application contracts ou eventos definidos, nunca importando persistência interna.

## Alternativas

Microsserviços aumentariam custo de operação e consistência antes de haver escala/equipes. Repositórios separados dificultariam evolução conjunta de contrato.

## Consequências

Builds compartilhados e revisão de limites são necessários. Extração depende dos gatilhos em evolution.md.

Referências: [arquitetura](../architecture/overview.md), [persistência](../architecture/persistence.md), [evolução](../architecture/evolution.md), [vertical](../roadmap/first-vertical.md).
