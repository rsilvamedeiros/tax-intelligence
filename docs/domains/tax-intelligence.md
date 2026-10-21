# Tax Intelligence

Status: núcleo puro sintético DEMO-TOTAL-001 implementado conforme [ADR 0022](../adr/0022-synthetic-diagnostic-core.md). Contrato público e comparação determinística com evidência; sem execução remota, persistência ou regra tributária real. [Validação](../engineering/synthetic-diagnostic-core-validation.md).

## Objetivo e responsabilidades

Executar diagnóstico rastreável e regras versionadas.

## Entidades e regras propostas

RuleDefinition, DiagnosticRun, Finding, Evidence. Fonte/vigência/versão obrigatórias para regra real; dinheiro exato. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

Implementado somente resultado sintético versionado: regra, referência, total declarado, linhas copiadas, soma, diferença declarada menos calculada e match/mismatch por documento, preservando ordem. Limites garantem inteiros seguros, inclusive soma de 10 bilhões de centavos. Fonte é a fixture do projeto, sem validade fiscal; sem classes ou motor genérico. Application valida o contrato público de Fiscal Compliance antes de chamar a função pura; não acessa seus internals ou tabelas. Autorização, execução registrada e auditoria permanecem propostas.

## Fluxo e integrações

Dados validados → execução → evidência → revisão. Interfaces: Fiscal por contratos; Audit por porta transacional. Eventos propostos: DiagnosticCompleted, FindingDetected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Regra inventada, vigência errada, falso positivo. Não transmite obrigação nem usa LLM como calculadora.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
