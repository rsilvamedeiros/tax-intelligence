# ADR 0017 — Contrato do lote sintético

Data: 20/10/2026. Status: etapa de implementação iniciada pelo pedido de próxima entrega após integração da PR #20 (`fb9ffd5`). Aceita o recorte da [RFC 0003](../rfc/0003-synthetic-document-intake.md); esta primeira entrega implementa somente contrato e preparação pura do comando. Persistência, autorização transacional e rotas pertencem à continuação, antes de BFF/UI ou diagnóstico.

## Decisão e critérios de aceite

Schemas runtime estritos em `@tax/contracts` para entrada, recibo, detalhe e chave idempotente, com OpenAPI gerado dos mesmos schemas. Entre 1–10 documentos, referências ASCII únicas, 1–10 linhas e centavos inteiros de 0 a 1.000.000.000. Aceitar total divergente: nenhuma regra de diagnóstico nesta etapa. IDs de recurso UUID e chave idempotente UUID v4 normalizados para minúsculas; createdAt UTC canônico com milissegundos.

Fiscal Compliance recebe o tipo do comando validado e fornece função pura de representação canônica: ordem fixa das propriedades e preservação da ordem de documentos/linhas. Sem hash como prova de igualdade, I/O, banco, Nest, React ou mutação da entrada. Contratos não importam o contexto da API. Não criar entidades com identidade persistida antes do consumidor de persistência.

O limite de 16 KiB, Content-Type, unicidade do header, query vazia, autenticação, papéis, lock, auditoria e RLS exigem transporte/persistência reais na próxima entrega. Schemas isolados não comprovam esses controles. Não criar endpoint que devolva sucesso sem banco nem aumentar permissões atuais.

## Plano, riscos e validação

Documentar antes do código; primeiro teste deve falhar por comportamento ausente com scaffold compilável, depois implementar mínimo. Cobrir limites inclusivos, arrays vazios/excessivos, referências duplicadas, campos extras, coerção indevida, frações, NaN/infinito, UTF-8 não permitido, respostas fechadas e datas inválidas. Demonstrar equivalência por ordem das propriedades e diferença por valores/ordem de arrays; não diagnosticar divergência nem alterar a entrada.

Riscos: coerção de centavos, vazamento por resposta permissiva e canonização que apaga diferenças. Aceite: invariantes e projeções verificadas com dados sintéticos; tipos, lint, cobertura, build, formato e docs sem reduzir thresholds. Revisão local e externa com evidências reais; aprovação humana antes de merge. [Registro de validação](../engineering/synthetic-document-contract-validation.md).

Sem schema persistido, migration, grant, variável de ambiente, dependência nova ou mudança operacional. Rollback da aplicação remove consumidores futuros; esta etapa não tem dados a reverter. Não distribuir processo nem adicionar fila. Evolução: fechar composição transacional, deadline, schema/grants aditivos e isolamento A/B em PostgreSQL antes de ativar POST/GET; basear tamanho de lote/assíncrono em medição.
