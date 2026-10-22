# Tax Intelligence

Etapa posterior do [ADR 0025](../adr/0025-synthetic-diagnostic-http.md) publica POST/GET autenticados para execução/consulta sintéticas, sem novas permissões. [Evidências](../engineering/synthetic-diagnostic-http-validation.md). Limites de ausência de HTTP nos parágrafos abaixo referem-se ao recorte histórico do ADR 0024; BFF/UI e regras reais continuam indisponíveis.

Status: núcleo puro sintético DEMO-TOTAL-001 implementado conforme [ADR 0022](../adr/0022-synthetic-diagnostic-core.md), com persistência da execução no [ADR 0024](../adr/0024-synthetic-diagnostic-persistence.md). Contrato público e comparação determinística com evidência; sem regra tributária real; HTTP acrescentado posteriormente pelo ADR 0025. [Validação](../engineering/synthetic-diagnostic-persistence-validation.md).

## Objetivo e responsabilidades

Executar diagnóstico rastreável e regras versionadas.

## Entidades e regras propostas

RuleDefinition, DiagnosticRun, Finding, Evidence. Fonte/vigência/versão obrigatórias para regra real; dinheiro exato. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

Implementado somente resultado sintético versionado: regra, referência, total declarado, linhas copiadas, soma, diferença declarada menos calculada e match/mismatch por documento, preservando ordem. Limites garantem inteiros seguros, inclusive soma de 10 bilhões de centavos. Fonte é a fixture do projeto, sem validade fiscal; sem classes ou motor genérico. Application valida o contrato público de Fiscal Compliance antes de chamar a função pura; não acessa seus internals ou tabelas. Autorização, execução registrada e auditoria foram acrescentadas em etapa posterior pelo ADR 0024.

## Fluxo e integrações

Persistência implementada no [ADR 0024](../adr/0024-synthetic-diagnostic-persistence.md): unidade de trabalho injetada, snapshot público de Fiscal e evento de Audit na mesma conexão, com revalidação sob lock de organização. Migration 0007 e login restrito foram exercitados em PostgreSQL isolado e no serviço compilado, conforme [evidências](../engineering/synthetic-diagnostic-persistence-validation.md). Isso ainda não publica operação remota ou interface de diagnóstico.

Casos de uso de criação/replay/consulta no [ADR 0023](../adr/0023-synthetic-diagnostic-use-cases.md) usam somente capacidades transacionais específicas e contrato público de snapshot. Application verifica scope, referência e evidência antes de retornar resultado; criação aguarda evento e conclusão da unidade de trabalho. Adapter e prova PostgreSQL constam do ADR 0024, ainda sem exposição HTTP. [Validação](../engineering/synthetic-diagnostic-use-cases-validation.md).

[RFC 0004](../rfc/0004-synthetic-diagnostic-execution.md), histórica, propôs execução registrada única por organização/lote/regra/versão e replay entre atores autorizados, com autoria original preservada. Snapshot de Fiscal, autorização e auditoria compartilham transação por portas públicas, sem SQL em application/domain. Execução, tabelas e perfil de grants foram implementados e exercitados em teste no ADR 0024; provisionamento de runtime e endpoints continuam pendentes. [Matriz e evidências](../engineering/synthetic-diagnostic-execution-test-plan.md).

Dados validados → execução → evidência → revisão. Interfaces: Fiscal por contratos; Audit por porta transacional. Eventos propostos: DiagnosticCompleted, FindingDetected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Regra inventada, vigência errada, falso positivo. Não transmite obrigação nem usa LLM como calculadora.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
