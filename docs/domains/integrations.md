# Integrations

Status: modelo proposto; nenhum contexto de negócio implementado na fundação.

## Objetivo e responsabilidades

Adaptar fontes externas com limites explícitos.

## Entidades e regras propostas

ConnectorConfiguration, ImportReceipt, SyncCursor. Allowlist, timeout, retry limitado e credencial segregada. Agregados e value objects serão definidos pelo primeiro caso de uso, sem classes antecipadas.

## Fluxo e integrações

Obter fonte autorizada → validar envelope → entregar conteúdo. Interfaces: ERP, fiscal, folha, SST e serviços oficiais validados. Eventos propostos: SourceReceived, IntegrationFailed; envelope futuro com eventId, tenantId, occurredAt, schemaVersion e correlationId. Transporte durável não definido; não prometer entrega exactly-once.

## Riscos e limites

Rate limit, SSRF, contrato desconhecido, certificado. Não interpretar regra fiscal; nenhum scraping autenticado presumido.

Critério para avançar: contrato, teste negativo do risco principal e autorização da etapa. Ver [mapa](context-map.md), [vertical](../roadmap/first-vertical.md) e [segurança](../security/security-model.md).
