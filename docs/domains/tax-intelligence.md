# Tax Intelligence

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Executar diagnóstico rastreável e regras versionadas.

## Entidades e regras propostas

RuleDefinition, DiagnosticRun, Finding, Evidence. Fonte/vigência/versão obrigatórias para regra real; dinheiro exato. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Dados validados → execução → evidência → revisão. Interfaces: Fiscal por contratos; Audit por porta transacional. Eventos propostos: DiagnosticCompleted, FindingDetected; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Regra inventada, vigência errada, falso positivo. Não transmite obrigação nem usa LLM como calculadora.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
