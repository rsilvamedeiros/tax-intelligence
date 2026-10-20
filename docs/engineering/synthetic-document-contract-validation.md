# Validação do contrato de lote sintético

Escopo: [ADR 0017](../adr/0017-synthetic-document-contract.md), após PR #20 integrada. Plano: schemas/runtime e OpenAPI compartilhados, representação canônica pura e testes Red/Green antes da implementação. [Matriz da vertical](synthetic-document-intake-test-plan.md): esta entrega cobre contrato e preparação do comando, sem concluir idempotência persistida ou qualquer negativo de tenant.

## Evidências

Implementados schemas estritos de entrada/recibo/detalhe/chave e seus OpenAPI em `@tax/contracts`; API contém somente função pura de representação canônica. Sem novo endpoint, middleware, wiring de módulo, persistência, grant, migration, dependência ou configuração. A função exige comando previamente validado; seu tipo TypeScript não valida entrada externa. O consumidor deverá executar o schema antes de canonizar.

## Red/Green observado

1. Scaffold compilável de entrada inicialmente aceitou valores negativos/fracionários, limites indevidos, extras e referências inválidas: 13 falhas e um teste aprovado. Restrições levaram aos 14 aprovados.
2. Scaffolds permissivos de resposta/chave: 18 falhas e 31 aprovados; recibos inseguros eram aceitos e IDs não normalizavam. Schemas fechados, UUIDs normalizados e timestamp UTC canônico levaram aos 49 aprovados. Limites inclusivos, dinheiro sem coerção e entradas malformadas também foram acrescentados nessa fase como regressões complementares, sem alegar Red individual de cada caso. Dois casos adicionais de newline passaram depois.
3. Representação canônica ainda ausente retornava string vazia: sete testes falharam por conteúdo/equivalência ausentes. Projeção explícita com ordem fixa levou aos sete aprovados, preservando valores, ordem de arrays e entrada congelada, sem incluir extras ou diagnosticar total divergente.
4. Teste de interoperabilidade do OpenAPI revelou perda do flag case-insensitive da regex: um teste falhou e 52 passaram, pois UUID maiúsculo aceito pelo runtime era rejeitado pelo padrão publicado. Classes ASCII explícitas corrigiram: 53 aprovados. Nenhum teste foi removido ou relaxado.

## Verificações locais em 20/10/2026

`pnpm lint`, `pnpm typecheck` e `pnpm build` aprovados. Compilação TypeScript explícita dos dois novos specs também aprovada com configurações temporárias locais, pois o build padrão exclui specs. `pnpm test:coverage --concurrency=1`: 424 testes aprovados (88 contratos, 183 API, 64 componentes web, 89 BFF), incluindo 60 novos; novos módulos com 100% em statements/branches/functions/lines, thresholds existentes preservados. Smokes de OTLP e autenticação do processo compilado aprovados. `pnpm audit:dependencies`: exit 0, uma vulnerabilidade moderada preexistente, sem high/critical.

Integração PostgreSQL, membership compilada e jornadas Chrome/Keycloak não foram repetidas localmente: sem alteração de banco, transporte ou UI. Conferir suas regressões no CI; não usar resultado anterior como execução desta entrega. Casos INTAKE-02 a INTAKE-12 continuam pendentes. INTAKE-01 e preparação de igualdade do comando são cobertos aqui; replay persistido e isolamento não estão implementados.

Revisão local conferiu limites numéricos exatos, unicidade por referência, contratos fechados, OpenAPI da mesma fonte e projeção sem mutação. OpenAPI descreve unicidade das referências, mas esse refinamento entre itens exige validação runtime; `uniqueItems` não substitui unicidade por propriedade. Sem achado bloqueante local, sem alegação de revisão independente. `pnpm format:check`, `pnpm validate:docs` (94 Markdown e 16 skills) e `git diff --check` aprovados. Conferir revisão remota pelo head da PR antes da entrega.
