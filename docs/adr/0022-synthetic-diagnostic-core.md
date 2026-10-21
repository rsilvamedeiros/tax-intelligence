# ADR 0022 — Núcleo do diagnóstico demonstrativo

Data: 21/10/2026. Status: etapa solicitada após integração da PR #25. Autoriza somente contrato de resultado e núcleo puro DEMO-TOTAL-001, com validação de entrada em application. Não autoriza execução remota, persistência de resultados, novas permissões, UI, regra tributária real ou deploy.

## Decisão e limites

Tax Intelligence recebe o contrato público SyntheticDocumentBatchInput de Fiscal Compliance; não acessa suas entidades privadas ou tabelas. A função de application recebe unknown, valida pelo schema existente e só então chama domínio puro. Nenhum módulo Nest ou rota registra essa função nesta etapa. Não constitui caso de uso autenticado: autorização de execução sobre lote persistido requer etapa posterior.

DEMO-TOTAL-001 versão 1.0.0 compara total declarado com soma de linhas. Fonte: especificação sintética deste projeto; sem fonte normativa, jurisdição ou vigência tributárias e sem validade fiscal. Cada documento produz evidência, inclusive quando os valores coincidem: referência, total declarado, cópia das linhas, soma, diferença declarada menos calculada e outcome match/mismatch. Ordem preservada; sem timestamp, UUID aleatório, tenant ou identidade no resultado puro. Resultado equivalente para entrada equivalente, sem mutar entrada ou compartilhar arrays mutáveis com ela.

Contrato fechado synthetic-document-diagnostic-v1, metadados literais de regra, origem project-fixture-specification e fiscalValidity none. Um a dez documentos, referências únicas e limites da entrada existente. Soma máxima 10.000.000.000 centavos; diferença entre -10.000.000.000 e 1.000.000.000. Ambos cabem exatamente em Number seguro; não usar coerção, arredondamento ou operações bitwise. Domínio importa somente tipos públicos, sem Nest, Zod, ORM, relógio, rede ou LLM. Application valida entrada, sem envolver erro de transporte ou persistir dado.

## Plano, riscos e aceite

1. Teste Red comportamental do schema fechado de resultado com rejeição de resultado vazio; Green e regressões de limites/metadados/campos extras.
2. Teste Red da execução válida ainda ausente; Green mínimo de soma, evidência e preservação de ordem.
3. Teste Red de execução com entrada inválida antes de application validá-la; Green com schema compartilhado. Registrar separadamente regressões que não tiveram Red observado.
4. Testar coincidência, divergência positiva/negativa, zero, dez linhas no máximo, inteiros acima de 32 bits, repetibilidade, entrada congelada e isolamento por cópia. Negativos: centavos fracionários/negativos/string/NaN/infinito, excesso de documentos/linhas, referência duplicada e campos extras.

Risco principal: chamar comparação aritmética de diagnóstico fiscal ou aceitar entrada inválida. Mitigar por metadados explícitos, nomes sintéticos, schemas estritos e ausência de exposição remota. Schema de resultado valida estrutura/limites; consistência aritmética pertence ao domínio e seus testes, sem duplicar cálculo no contrato. Checks: cobertura, lint, tipos, build, smokes, links/formato e revisão local; CI preserva regressões de banco/navegador. Sem alteração SQL, testes locais de banco não são necessários para este recorte. Revisão humana antes de merge, sem merge automático.

Próximo ponto de decisão: propor execução sobre lote persistido, autorização revalidada, registro versionado e auditoria atômica, com ADR/plano próprios antes de endpoints ou migrations. Núcleo puro não conclui a primeira vertical.
