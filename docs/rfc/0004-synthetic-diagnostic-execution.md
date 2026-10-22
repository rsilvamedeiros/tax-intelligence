# RFC 0004 — Execução registrada do diagnóstico sintético

Persistência implementada nesta etapa no [ADR 0024](../adr/0024-synthetic-diagnostic-persistence.md): snapshot público, transação, RLS/grants e auditoria exercitados em PostgreSQL real. [Evidências](../engineering/synthetic-diagnostic-persistence-validation.md). O recorte do ADR 0023 e a proposta original abaixo são históricos; runtime, HTTP, BFF/UI e OTLP específicos permanecem pendentes.

Data: 22/10/2026. Status: proposta de persistência em revisão, preparada após integração da PR #26 (`bb62627`). Preparação documental na PR #27, aberta no início do [ADR 0023](../adr/0023-synthetic-diagnostic-use-cases.md): o pedido de próximo módulo delimitou contratos/casos de uso, sem aceitar silenciosamente decisões de SQL/grants. Migrations, runtime, endpoints, BFF/UI e deploy continuam fora desse recorte. Responsável pelo aceite de isolamento e transação reais: mantenedor. [Plano de testes](../engineering/synthetic-diagnostic-execution-test-plan.md).

## Problema e resultado observável

O [ADR 0022](../adr/0022-synthetic-diagnostic-core.md) compara valores sintéticos em memória, mas não associa resultado a lote persistido, ator autorizado ou evento de auditoria. Falta uma operação reproduzível que atravesse essas fronteiras sem confiar no conteúdo enviado pelo navegador nem ler tabelas privadas entre contextos.

Proposta: administrador ou analista ativo solicita DEMO-TOTAL-001 1.0.0 para um lote existente da organização A. A aplicação carrega o lote por contrato público de Fiscal Compliance, executa o núcleo puro e confirma resultado/evidência e evento mínimo na mesma transação. Quatro papéis ativos podem consultar execução registrada. Ator apenas de B não obtém dados de A; revogação impede execução, replay e leitura posteriores. Comparação continua **sem fonte normativa e sem validade fiscal**.

## Alternativas e recomendação

| Alternativa                                       | Consequência                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Calcular no GET sem registrar                     | Repete processamento, não prova quando/por quem o resultado foi registrado e não atende auditoria atômica          |
| Criar execução com chave arbitrária por tentativa | Introduz reconciliação de chaves e múltiplas execuções idênticas para um lote imutável sem necessidade demonstrada |
| Uma execução por organização/lote/regra/versão    | Recomendada: identidade natural, resultado imutável e replay determinístico, sem confiar em chave do browser       |
| Fila, worker e eventos distribuídos               | Desnecessários para até dez documentos de dez linhas; ampliam falhas e consistência antes de medir latência        |

Uma execução é única por `(tenant_id, batch_id, rule_id, rule_version)`, independentemente do ator solicitante. A API futura escolhe a regra/versão fixas; cliente não envia regra, versão, resultado ou documentos. Nova versão gera novo registro; resultados anteriores não são sobrescritos. Não há execução forçada, edição, exclusão ou histórico paginado neste recorte.

## Fronteiras e transação propostas

Tax Intelligence possui execução e resultado; Fiscal Compliance possui lote/documentos/linhas; Organizations possui autorização; Audit possui evento. O adapter atual de lote abre sua própria transação: chamar `SyntheticDocumentBatchStore.get` e depois gravar diagnóstico em outra transação **não atende esta proposta**. Não importar seu método privado de leitura nem mover cálculo para database.

O ADR de implementação deve introduzir uma porta pública de Fiscal para fornecer snapshot validado do lote na transação autorizada do diagnóstico. A composição de infraestrutura mantém uma única conexão e oferece capacidades específicas de autorização, leitura do snapshot, gravação da execução e evento. Domínio/application não recebem PoolClient, SQL ou callback genérico de banco; Fiscal não importa Tax Intelligence. Database não importa código de apps/api. Domain continua usando apenas tipos públicos; application reutiliza `diagnoseSyntheticBatch` do ADR 0022.

Sequência proposta em READ COMMITTED, PostgreSQL 17+:

1. Verificar perfil do login dedicado, baseline limpo e iniciar transação com lock_timeout 1500 ms, statement_timeout 2000 ms e transaction_timeout 5000 ms, como no ADR 0018.
2. Organizations resolve issuer/subject recebido de autenticação confiável, verifica membership/papel **antes** de disputar o advisory lock por organização canônica e revalida depois da espera, mantendo o mesmo protocolo das mutações administrativas. Sem permissão, recusar sem adquirir lock.
3. Após autorização, definir tenant local parametrizado. Todas as consultas também filtram tenant explicitamente. Ler o lote pelo snapshot público de Fiscal, validando completude/ordinais e schema existente. Lote ausente ou de outro tenant produz o mesmo not_found.
4. Calcular resultado determinístico. Consultar execução pela chave natural; existente deve ter contrato, regra, lote e evidência equivalentes ao snapshot atual. Divergência implica falha de integridade sanitizada, nunca sobrescrita ou novo evento. Autorização é revalidada mesmo em replay.
5. Ausente: inserir execução, resultado normalizado e evento mínimo de Audit. Confirmar tudo junto; qualquer erro reverte tudo. Unicidade no banco reforça a serialização por organização. Replay retorna o recibo original sem evento extra.
6. Consulta por identificador também exige autorização ativa e lock/revalidação até commit. Validar registro antes de projetar resposta. Descartar conexão contaminada ou com rollback impossível, preservando erro original.

Ordem de locks é única: organização antes das operações de lote/execução; não introduzir protocolo concorrente. Operação autorizada pode concluir antes da revogação; quem aguardou revogação ou rebaixamento deve revalidar. Sem chamada externa, segundo pool ou await de rede dentro da transação. O deadline da transação não substitui timeout de aquisição de conexão; ADR fixa também aquisição e orçamento total antes da implementação.

## Dados, RLS e privilégios propostos

Duas relações aditivas propostas: `tax_intelligence.synthetic_diagnostic_runs` e `audit_compliance.synthetic_diagnostic_creations`. Schema/migration e nomes definitivos dependem do ADR de execução; nenhuma tabela existe por causa desta RFC.

Execução: tenant obrigatório, UUID próprio, batch_id, ator interno iniciador, regra/versão fixas, created_at UTC e resultado JSONB normalizado pelo schema público do ADR 0022. Limitar resultado a 16 KiB de UTF-8 na aplicação e por CHECK de octet_length da representação textual no banco; não armazenar JSON bruto recebido do cliente. Valores monetários e linhas são a evidência sintética explícita, sem identidade externa, segredo ou texto livre. Chave única natural e FK composta `(tenant_id, batch_id)` para o lote; mesmo tenant nas relações. JSONB não prova aritmética: aplicação deve validar estrutura e equivalência ao núcleo/snapshot antes de inserir e de devolver leitura. Dados inválidos falham fechado, sem correção silenciosa.

Banco de teste/runtime deve usar encoding UTF8 para a checagem de bytes. Ambos os limites (serialização da aplicação e representação textual do JSONB) são exigidos; diferenças de espaços na serialização não autorizam ultrapassar o CHECK.

Audit: tenant, ator iniciador, execution_id e request_id; UUID/data gerados pelo banco, FK composta para execução. Regra/versão/lote são recuperáveis pela referência, sem replicar documentos ou chave em logs/eventos. Evento não é parecer fiscal nem promessa de imutabilidade contra owner/administrador do banco. Falha de INSERT de evento reverte execução.

ENABLE/FORCE RLS nas duas relações novas, policies por comando e tenant local verificado. RLS permanece adicional à autorização; setting mutável não protege contra SQL arbitrário comprometido. DB-03 das tabelas de controle não é resolvido por esta RFC.

Recomenda-se login/pool próprio de diagnóstico, distinto de administrativo, BFF e lote, sem alterar a allowlist restritiva atual do lote. Recebe SELECT de atores/memberships somente via adapters existentes; SELECT das três relações fiscais para o snapshot público; SELECT/INSERT da execução e INSERT apenas nas colunas mínimas do novo evento. Sem escrita fiscal/controle, leitura de auditoria, UPDATE/DELETE/TRUNCATE, ownership, superuser, BYPASSRLS, herança/membership de roles, DDL, privilégios em sequences ou auth_bff. Sem GRANT a PUBLIC, CREATE ROLE na migration ou provisionamento automático no runtime. Asserção do perfil efetivo por operação e testes com login real, incluindo privilégios herdados/PUBLIC, são bloqueantes.

Ausência futura de configuração deve indisponibilizar só o diagnóstico, sem fallback para os pools existentes. Credencial inválida deve falhar sem registrar URL. Nome da variável, perfil exato e política de shutdown serão fixados no ADR, não provisionados nesta etapa documental.

## Contrato de aplicação e transporte posterior

Comando de execução: identidade confiável, organização, batchId e requestId; não aceitar documentos, ator interno ou tenant autorizado de payload. Resultado discriminado created/replayed com recibo `(id, batchId, ruleId, ruleVersion, createdAt)`; denied/not_found sem evidência. Storage/integridade/deadline falham por exceção sanitizada na borda futura. Consulta retorna recibo e `SyntheticDiagnostic` validado, sem ator interno, identidade externa ou auditoria.

Papéis propostos: organization_admin/analyst para criar **ou repetir** execução; quatro papéis ativos para consultar. Viewer que leu o resultado não ganha permissão de execução; rebaixamento impede replay de escrita. Novo administrador autorizado pode receber o mesmo recibo natural, sem assumir autoria do evento original.

Rotas candidatas, somente para revisão do futuro ADR HTTP: POST `/v1/organizations/:organizationId/synthetic-document-batches/:batchId/diagnostics` e GET `/v1/organizations/:organizationId/synthetic-diagnostics/:executionId`. POST sem corpo/query e sem chave idempotente arbitrária: identidade natural é o lote e a regra/versão fixas, diferente da criação do lote. Bearer verificado antes da validação de controller; erros do parser global podem preceder. UUIDs normalizados, no-store e request ID; 201 na primeira execução, 200 no replay; 401/403/404 uniformes e falha 503 sanitizada. Limites efetivos de corpo indevido, envelopes, OpenAPI e deadline HTTP exigem ADR/testes próprios. Nenhuma rota será publicada nesta entrega.

## Entregas, riscos, aceite e reversão

1. Aceitar ou ajustar esta RFC e a matriz de testes; registrar ADR de implementação com portas públicas, SQL/grants, constraints e deadline total. Aceite documental não autoriza deploy ou fonte fiscal real.
2. Contrato/caso de uso e persistência sob TDD: Red válido, Green mínimo, negativos, login restrito, concorrência e rollback com PostgreSQL real isolado. Contratos/casos de uso têm execução parcial no ADR 0023; persistência, concorrência e RLS continuam planejados.
3. Composição HTTP em etapa própria, seguida de BFF/UI com Origin/CSRF e limpeza por contexto. Não ampliar SQL pela web. Somente depois avaliar a vertical completa e sua evidência OTLP específica.

Riscos bloqueantes: leitura cruzada, lookup antes da autorização, transações separadas, execução/evento duplicados, privilégio excessivo, resultado inconsistente ou regra alterada sem versionamento. [Matriz](../engineering/synthetic-diagnostic-execution-test-plan.md) cobre cada risco. Autorresponsabilidade da revisão humana: isolamento, escopo dos grants e semântica de replay entre atores.

Reversão proposta desabilita consumidor/configuração e revoga apenas grants específicos do diagnóstico, preservando dados, eventos e RLS. Não fazer downgrade destrutivo ou desligar policies para restaurar acesso. Fila, cache ou particionamento só após medição do orçamento de latência e contenção do lock em etapa própria. Retenção/backup/restore e operação continuam requisitos anteriores a qualquer piloto real.

Aceite desta entrega: proposta e testes revisáveis, referências/estado coerentes, links e formato válidos; autorrevisão local e revisão externa identificadas separadamente. Commits/PR automáticos, sem merge ou deploy. Aprovação do mantenedor é o próximo ponto de decisão para implementação.

Validação local em 22/10/2026: `node scripts/validate-docs.mjs` aprovou 106 Markdown e 16 manifests de skills; `pnpm format:check` e `git diff --check` aprovados. Autorrevisão comparou autorização/lock, limites do adapter atual e perfil restrito dos ADRs 0018/0019, corrigindo a descrição antiga de persistência para distinguir criação do lote de execução posterior. Testes de aplicação/banco não foram repetidos localmente nesta mudança documental; novos casos permanecem planejados. CI e revisão externa serão conferidos no head da PR, sem confundir commit status com análise concluída.

Evidência remota: [CI da PR #27](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39789000665) aprovou os sete jobs em b0089aeea2106690bc5f836107a7edf44df361a9, incluindo as regressões de PostgreSQL 17.11 (108 testes/nove suítes) e Keycloak/Chrome 155 (uma jornada aprovada, zero falhas). GitGuardian aprovou os quatro commits desse head. Essas suítes não executam os novos cenários RUN-01–20. [CodeRabbit](https://github.com/rsilvamedeiros/tax-intelligence/pull/27#pullrequestreview-5615243277) revisou os nove arquivos até esse head; seu único achado Minor de concordância foi acolhido, reescrevendo o resumo para explicitar confirmação atômica do resultado com seu evento. Não alegar nova revisão completa do acompanhamento documental nem aceite humano da proposta.
