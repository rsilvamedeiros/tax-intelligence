# ADR 0004 — IA e regras fiscais

Data: 08/10/2026. Status: Decisão técnica registrada nesta etapa; revisão humana pendente.

## Contexto

Achados fiscais exigem vigência, fonte e reprodução; LLMs podem produzir explicações incorretas.

## Decisão

Cálculos/validações críticos determinísticos e auditáveis. LLMs apenas apoio de pesquisa/classificação/explicação com fonte e revisão humana. Fixtures são sintéticas.

## Alternativas

Decisão tributária autônoma por LLM não atende rastreabilidade. Proibir todo apoio de IA perderia utilidade em tarefas auxiliares de baixo risco.

## Consequências

Catálogo versionado de regras reais só após responsável especializado. Nenhum provider/credencial ou chamada de IA será implantado no bootstrap.

Referências: [arquitetura](../architecture/overview.md), [persistência](../architecture/persistence.md), [evolução](../architecture/evolution.md), [vertical](../roadmap/first-vertical.md).
