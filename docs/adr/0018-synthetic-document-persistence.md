# ADR 0018 — Persistência transacional do lote sintético

Data: 20/10/2026. Status: próxima entrega solicitada após integração da PR #21 (`1dfd8e2`). Executa a persistência da [RFC 0003](../rfc/0003-synthetic-document-intake.md), mantendo os contratos do ADR 0017. Sem endpoints, configuração de credenciais da API, BFF/UI ou diagnóstico nesta etapa.

## Modelo e autorização

Migration aditiva 0006 cria `fiscal_compliance.synthetic_batches`, `synthetic_documents`, `synthetic_lines` e `audit_compliance.synthetic_batch_creations`. Tenant obrigatório, FKs compostas, ordinais e limites de centavos inteiros; unicidade por tenant/ator/chave e por referência dentro do lote. Contagens esperadas são armazenadas e conferidas na leitura para detectar agregado incompleto. Sem JSON bruto persistido, fingerprint como autoridade, UPDATE ou DELETE de domínio.

Adapter de Organizations resolve issuer/subject pelo IdentityStore público, verifica membership/papel antes de disputar o advisory lock existente por organização canônica e revalida depois da espera. Esse contrato de infraestrutura é público; Fiscal não consulta tabelas de controle. Adapter de Audit possui INSERT do evento mínimo; Fiscal não escreve em tabela privada de auditoria. A composição dos adapters usa a mesma conexão/transação, sem SQL ou PoolClient no contrato público do lote e sem helper SQL genérico para o domínio.

Criar/repetir requer organization_admin ou analyst; consulta aceita os quatro papéis ativos. Resultado discrimina denied/conflict/not_found sem expor metadados alheios. Storage falha por exceção; tradução HTTP e autenticação do token permanecem na futura borda. Identidade recebida pelo adapter deve vir do Bearer verificado; não existe rota aceitando identidade de payload.

## Transação, igualdade e RLS

Pool dedicado é injetado, separado do login administrativo; nenhuma variável de ambiente nova ou credencial de produção provisionada. BEGIN READ COMMITTED, lock_timeout 1500 ms, statement_timeout 2000 ms e transaction_timeout 5000 ms (PostgreSQL 17+). Contexto `tax.tenant_id` por set_config local e parametrizado somente após autorização; queries também filtram tenant explicitamente. Baseline contaminado aborta antes de BEGIN, rollback impossível descarta conexão e preserva o erro original.

Criação do lote/documentos/linhas e evento confirma atomicamente. Após lock, replay consulta conteúdo normalizado e compara valores/ordem estruturalmente, sem considerar ordem das propriedades. Mesmo tenant/ator/chave retorna o recibo original sem evento extra; conteúdo diferente retorna conflito. Banco garante unicidade; serialização por organização também coordena com revogação/mudança de papel. Operação autorizada pode concluir antes da revogação; quem aguardou revalida obrigatoriamente.

ENABLE/FORCE nas quatro tabelas; policies por comando vinculam tenant ao contexto. Policies aplicam-se a PUBLIC, mas **nenhum GRANT é concedido a PUBLIC**: role/login é provisionado separadamente, sem nome fixo ou CREATE ROLE na migration. Login restrito recebe SELECT/INSERT no agregado, INSERT limitado às quatro colunas de evento e SELECT de controle para os adapters de Identity/Organizations. Sem ownership, superuser, BYPASSRLS, escrita de memberships, SELECT/UPDATE/DELETE/TRUNCATE de auditoria, DDL ou acesso auth_bff. Testes autenticam esse login e verificam os privilégios.

Setting mutável não autentica ator e não impede SQL arbitrário comprometido; DB-03 de controle permanece pendente. RLS do lote é defesa adicional e não equivale à autorização fiscal geral. Constraints de cardinalidade por linha não provam sozinhas completude do agregado; leitura valida contagens/ordinais e contrato antes de retornar dados.

## Plano, aceite e reversão

Documentação → teste Red de capacidade ausente em ambiente válido → criação mínima → Red de replay/idempotência → correção → negativos e concorrência em PostgreSQL real. Papel/grant/migration/ambiente inválidos não contam como Red. Observar locks via catálogo, sem sleep como prova; dados sintéticos e cleanup por IDs próprios. Validar migrations repetidas, RLS A/B sem filtro, FK cruzada, rollback de auditoria, precheck sem adquirir lock, revalidação após revoke/role change e recuperação do pool.

Executar integração completa, lint, tipos, cobertura e build; regressões compiladas e jornadas existentes no CI. [Evidências](../engineering/synthetic-document-persistence-validation.md). Aprovação humana de segurança antes de merge. Nenhuma aplicação em banco existente fora do teste isolado.

Rollback preserva migration/dados/eventos, desabilita futuros consumidores e revoga somente grants específicos. Não desligar RLS nem fazer downgrade destrutivo. Serialização por organização é a alternativa simples para este primeiro recurso; medir contenção antes de mudar protocolo compartilhado, dividir processos ou adicionar fila.
