# Validação do núcleo de diagnóstico sintético

Etapa do [ADR 0022](../adr/0022-synthetic-diagnostic-core.md), em 21/10/2026, após integração da PR #25. Tax Intelligence recebe o contrato público do lote por application e produz comparação pura DEMO-TOTAL-001, versão 1.0.0. Sem módulo Nest, endpoint, persistência, UI ou execução autenticada nesta entrega.

## TDD e casos

Três ciclos Red/Green observados antes de implementar cada comportamento:

1. Schema provisório aceitava `{}`; teste esperava rejeição e falhou. Schema fechado implementado; teste aprovado.
2. Função de domínio provisória lançava indisponibilidade; teste de total correspondente e evidência completa falhou. Comparação e projeção implementadas; teste aprovado.
3. Application provisória encaminhava entrada sem validação; teste de centavos fracionários esperava rejeição e falhou. Validação pelo schema público implementada; teste aprovado.

Regressões adicionais não contam como Red observado. Na primeira execução de cobertura, um teste parametrizado com array vazio foi interpretado pelo Jest como callback `done`, causando timeout de cinco segundos. Corrigida a matriz para objetos com a propriedade lineAmountsCents, de modo que cada array seja um argumento completo; não houve alteração de timeout ou implementação para passar. Essa falha de harness não conta como ciclo TDD.

63 testes novos: 30 de contrato, oito de domínio e 25 de application. Cobrem evidência explícita sem validade fiscal, contrato fechado, versão/origem, referências únicas, limites, inteiro negativo/fracionário/string/NaN/infinito, coincidência e diferenças positivas/negativas, máximo de 10 bilhões de centavos, ordem de dez documentos, repetibilidade, entrada congelada e cópia das linhas entre execuções. Consistência aritmética pertence ao domínio; schema de resultado valida estrutura e intervalos, sem repetir a regra.

## Verificações

- `pnpm test:coverage`: aprovado após corrigir a matriz; 668 testes (118 contracts, 265 API, 122 componentes/web, 163 BFF). Arquivos novos de contrato/application/domínio com 100% nos indicadores de cobertura, sem reduzir limites globais.
- `pnpm lint`, `pnpm typecheck` e `pnpm build`: aprovados.
- `pnpm test:smoke`: autenticação RSA e exportação OTLP real aprovadas, sem sentinelas sensíveis.
- `pnpm audit:dependencies`: exit 0, um advisory moderado existente; nenhuma dependência adicionada.

`pnpm format:check`, `node scripts/validate-docs.mjs` e `git diff --check`: aprovados; 104 documentos e 16 manifests de skills validados.

Nenhum teste PostgreSQL ou browser do novo diagnóstico existe: não há acesso a banco, rota ou UI para exercitar neste recorte. Não alegar execução local dessas suítes nesta etapa.

[CI da PR #26](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39676611805), no commit 556d0d764027620022f6a8d073c1ae48497f6a55: sete jobs aprovados, preservando 108 testes PostgreSQL 17.11/nove suítes, API compilada e jornada real Keycloak/Chrome 155 (uma aprovada, zero falhas), além do E2E geral. GitGuardian aprovou os cinco commits sem segredos detectados. Revisão completa do CodeRabbit concluída nesse head, conforme registro abaixo.

Revisão local é autorrevisão estática de contratos, precisão, fronteiras e ausência de exposição remota. [CodeRabbit](https://github.com/rsilvamedeiros/tax-intelligence/pull/26#pullrequestreview-5606372921) revisou os 17 arquivos até 556d0d7. Um achado Minor de status desatualizado no roadmap e uma sugestão Trivial de asserções OpenAPI foram acolhidos: etapa atual corrigida e teste existente ampliado para obrigatoriedade, limites e enum do artefato gerado, sem snapshot integral. Não houve alteração do código executável após a revisão. Não alegar revisão completa do acompanhamento posterior ou aprovação humana. Sem delegação para agentes.

## Limites e próximo ponto de decisão

Sem fonte normativa, jurisdição ou vigência tributárias; a origem é a fixture sintética do projeto. Resultado puro não tem identidade, tenant, data ou vínculo persistido com lote. Não fornece recomendação ou valor de tributo. O domínio exige entrada já validada; a função de application é a fronteira que valida unknown.

Antes de expor execução: propor contrato de referência ao lote, autorização revalidada, persistência versionada e auditoria atômica, RLS/grants e testes de isolamento em etapa própria. Não reutilizar esta função como rota sem essas decisões. Primeira vertical e operação fiscal de produção continuam incompletas.
