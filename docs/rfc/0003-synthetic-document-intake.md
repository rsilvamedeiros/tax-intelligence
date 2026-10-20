# RFC 0003 — Primeiro lote de documentos sintéticos

Status: aceita para execução incremental após integração da PR #20 (`fb9ffd5`) e pedido da próxima entrega. O [ADR 0017](../adr/0017-synthetic-document-contract.md) implementa somente schemas/OpenAPI e comando canônico. O [ADR 0018](../adr/0018-synthetic-document-persistence.md) acrescenta persistência, RLS e autorização transacional; composição/rotas da API e demais controles de transporte ainda não foram implementados. Responsável pela revisão de isolamento: mantenedor; sem aprovação automática de código crítico.

## Problema e objetivo observável

Login, memberships e administração estão implementados; o [ADR 0016](../adr/0016-synthetic-rls-proof.md) demonstra RLS apenas em fixtures. Falta um recurso da aplicação cuja criação e consulta atravessem autorização, persistência tenant-owned, auditoria e contrato HTTP.

Propor o menor primeiro consumidor: ator autorizado na organização A envia um JSON sintético, recebe o identificador do lote e consulta o conteúdo normalizado. Ator apenas de B não consegue consultar esse identificador. Repetir o mesmo comando não cria outro lote ou evento. Falha de auditoria reverte tudo. Revogar o vínculo impede nova operação com o mesmo token válido.

O nome `SyntheticDocumentBatch` e a versão do documento deixam explícito que não se trata de nota fiscal, SPED, folha ou leiaute oficial. Nenhum tributo é calculado. `DEMO-TOTAL-001`, diagnóstico, parecer e achados continuam um módulo posterior.

## Alternativas e recorte recomendado

| Opção                                           | Custo e consequência                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicar RLS às tabelas de identidade existentes | Mistura lookup de controle com dados de domínio; exige resolver DB-03 sem entregar um recurso de negócio                               |
| Importação completa com diagnóstico e UI        | Amplia simultaneamente parser, cálculo demonstrativo, armazenamento, autorização e jornada; dificulta revisar a primeira adoção de RLS |
| Lote sintético síncrono com POST/GET            | Recomendado: um agregado, limite pequeno, transação local e negativos verificáveis antes de UI/diagnóstico                             |

Sem fila, worker, cache, object storage, arquivo multipart, XML, conector ou dependência externa. Migrar para processamento assíncrono somente se medições mostrarem que o lote autorizado não cabe no orçamento de uma requisição; definir esse orçamento e deadline antes da implementação.

## Contrato proposto

API futura: `POST /v1/organizations/:organizationId/synthetic-document-batches` e `GET /v1/organizations/:organizationId/synthetic-document-batches/:batchId`. Sem listagem, edição ou exclusão neste recorte. Corpo somente no POST, `application/json`, máximo 16 KiB em bytes efetivamente recebidos, mesmo sem Content-Length. Query vazia e schemas fechados. IDs UUID; campos extras e coerção de números são rejeitados.

Exemplo de documento sintético, sem pessoas, empresas ou identificadores fiscais:

```json
{
  "schemaVersion": "synthetic-document-batch-v1",
  "documents": [
    {
      "reference": "demo-001",
      "declaredTotalCents": 300,
      "lineAmountsCents": [100, 200]
    }
  ]
}
```

Entre um e dez documentos por lote; referência ASCII `[a-z0-9-]{1,40}`, única no lote; entre uma e dez linhas por documento. Valores são inteiros não negativos de até 1.000.000.000 centavos, sem strings, arredondamento ou ponto flutuante de cálculo. A ordem de documentos/linhas é significativa e preservada. Divergência entre total declarado e linhas não impede recebimento: não executar diagnóstico disfarçado de validação estrutural. Limites são especificação desta fixture, sem origem normativa.

POST exige `Idempotency-Key` UUID v4 único, diferente do `x-request-id` de observabilidade. Chave escopada por organização e ator interno; comparar o comando validado canônico, incluindo versão e ordem, sem depender da ordem das propriedades JSON. Mesmo comando/chave: mesma resposta 200; primeira criação: 201; chave reutilizada com conteúdo diferente: 409. Normalizar IDs antes de compor chave e locks. Autorização de escrita é revalidada antes de qualquer replay; nenhum sucesso deduzido somente de hash. Recibo é o próprio lote persistido, sem expiração automática neste corte de desenvolvimento sintético.

Resposta do POST: somente `id`, `schemaVersion` e `createdAt` UTC. GET acrescenta `documents` validados; nunca inclui conta interna, identidade externa, hash, chave idempotente ou auditoria. POST e GET usam `Cache-Control: no-store` e o envelope de erro/request ID existente. A API só chama um recurso de sintético por seu contrato limitado; isso não verifica a origem de cada valor recebido e não autoriza dados reais no ambiente.

## Autorização e concorrência propostas

Bearer verificado precede validação de transporte no caso de uso; limites/parsing globais podem rejeitar o corpo antes do controller. Organização da rota é intenção, nunca autorização. Identity fornece ator por issuer/subject; Organizations fornece contrato público para validar e manter a autorização transacional. Fiscal Compliance não consulta tabelas privadas de Identity/Organizations.

| Ação                       | Papéis ativos propostos                               |
| -------------------------- | ----------------------------------------------------- |
| Criar lote ou repetir POST | `organization_admin`, `analyst`                       |
| Consultar lote             | `organization_admin`, `analyst`, `reviewer`, `viewer` |

Nenhuma permissão fiscal passa a existir antes do aceite. Sem membership ativa: 403 uniforme. Depois de validar a organização permitida, identificador ausente ou de outra organização: 404 indistinguível. Sem token/inválido: 401; transporte inválido: 400; corpo excessivo: 413; tipo de mídia não aceito: 415; storage/lock/auditoria indisponível: 503 sanitizado. Asserções devem cobrir diferenças de ordem de validação sem prometer ocultar informação de recurso antes de verificar membership.

Antes de disputar qualquer lock, verificar ator, membership ativa e papel exigido pela ação; recusar quem não possui permissão sem adquirir o lock. Depois, reutilizar o protocolo de lock por organização das mutações administrativas, pela mesma chave canônica e ordem, e revalidar ator, membership e papel dentro da transação. A verificação preliminar não substitui a revalidação após a espera. A porta de Organizations mantém esse lock até o commit da operação de domínio e acompanha a mesma conexão/transação; o tipo exposto não pode importar Drizzle/Nest no domínio. Registrar ambas as verificações e essa composição no ADR de execução, sem exportar helper SQL genérico. Revogação e mudança de papel não podem confirmar entre a autorização e o commit da criação/leitura. Operação já autorizada pode concluir antes da revogação; operação que espera deve revalidar depois do lock. Usar protocolo único no primeiro módulo, aceitando serialização por organização até medir contenção.

## Persistência e limites de RLS propostos

Fiscal Compliance possui lote, documentos e linhas; evento mínimo pertence à porta de Audit and Compliance, sem acesso a internals de outro contexto. Criação do agregado e evento na mesma transação local/conexão. `tenant_id NOT NULL`, ordinais e FKs compostas preservam organização em cada relação. Unicidade da idempotência inclui tenant/ator/chave. Não armazenar JSON bruto ou documentos externos; guardar somente campos normalizados aceitos. Schema físico e migration aditiva exigem ADR de implementação e testes de constraints.

Role de migration separada e login runtime dedicado a este domínio, sem ownership/superuser/BYPASSRLS, com ENABLE/FORCE e policies por comando nas novas relações tenant-owned. Esse login recebe somente SELECT/INSERT necessários no agregado, INSERT na auditoria e leituras de controle necessárias à porta de Organizations na mesma transação. Não recebe os privilégios de alteração de memberships do login administrativo existente, UPDATE/DELETE/TRUNCATE de domínio, criação de objeto ou leitura da auditoria. A composição mantém as credenciais separadas e só concede uso da porta com a conexão autorizada para o caso de uso; configuração exata fica no ADR de execução. Novos grants só entram na etapa de implementação aceita; BFF mantém acesso exclusivo às sessões técnicas.

Contexto transacional é definido com parâmetro somente depois de membership verificada, nunca por header/payload arbitrário. Consultas também exigem tenant explícito. Conexão sem contexto não lê/escreve; contexto inválido falha fechado; conexão contaminada ou cujo rollback falhou é descartada. Os helpers privados da prova sintética não serão promovidos automaticamente a biblioteca de produção.

RLS com setting mutável não autentica ator e não protege contra SQL arbitrário comprometido. A role API ainda pode consultar dados de controle conforme grants atuais; este recorte não resolve DB-03 nem autoriza habilitar RLS globalmente em memberships/atores. Explicitar essa limitação no ADR e no relatório; o GET HTTP de negócio deve provar isolamento por aplicação e policies reais nas tabelas novas.

## Entregas após aceite, testes e rollback

1. Registrar ADR com permissão, transação, deadline, grants/schema e estratégia aditiva; testes Red de contrato, domínio e autorização antes do código.
2. Persistência em PostgreSQL real: RLS das tabelas novas, concorrência com revogação, deduplicação e evento atômico; API compilada com role restrita. [Matriz proposta](../engineering/synthetic-document-intake-test-plan.md).
3. BFF e UI em etapa posterior, usando os contratos aprovados, Origin/CSRF e limpeza por sessão/organização. Sem SQL de domínio na web.
4. Só então propor `DEMO-TOTAL-001` e sua evidência determinística; nenhuma regra tributária real por associação.

Aceite exige negativos de A/B, replay sem evento duplicado, rollback sem efeito parcial e concorrência ordenada por locks observados. Cobertura e checks existentes preservados. Aprovação humana de isolamento antes de merge de código. Este documento não afirma execução desses testes.

Rollback proposto desabilita as novas rotas e remove apenas grants adicionais da etapa, preservando dados, auditoria e migrations aplicadas. Reversão destrutiva ou desligar RLS para restaurar acesso não são estratégias aceitas. Antes de qualquer piloto real, definir retenção, responsáveis, backup/restore, capacidade e operação; não transformar prazo sintético em obrigação fiscal.

## Histórico da preparação documental (PR #20)

Aceite atual: RFC e matriz revisáveis, índices/roadmap/status coerentes, distinção entre implementado e proposto, links e formato válidos. Riscos: confundir prova com autorização de domínio, permissões implícitas ou prometer compatibilidade fiscal. Mitigação: manter esta RFC como proposta e nenhuma mudança funcional. Revisão local e remota, commits por entrega e PR para `main`; sem merge/deploy automático.

Validação local em 20/10/2026: `pnpm validate:docs` aprovou 92 Markdown e 16 skills; `pnpm format:check` e `git diff --check` aprovados. Revisão local conferiu papéis existentes, protocolo de lock e separação do login de domínio. Testes de aplicação não foram repetidos nesta entrega documental; testes da nova matriz não existem ainda. Conferir CI e revisão externa pelo head da PR antes de declarar a entrega revisada.

Revisão externa: [CodeRabbit](https://github.com/rsilvamedeiros/tax-intelligence/pull/20#pullrequestreview-5580453129) concluiu a análise dos dez arquivos até `831effb`. Dois achados Minor corrigidos no acompanhamento documental: crase no status e autorização preliminar antes do lock, preservando a revalidação transacional e seu teste planejado. Sete jobs Actions e GitGuardian aprovados nesse head. Não alegar nova revisão completa da correção posterior; aceite humano da proposta e autorização de implementação continuam separados.
