# RFC 0002 — Prova sintética de isolamento RLS

Data: 19/10/2026. Status: proposta para revisão; implementação não autorizada por este documento. Responsável pelo aceite: mantenedor. Na preparação inicial, a PR #16 da interface administrativa aguardava integração; foi integrada durante a revisão. Esta RFC descreve somente o desenho; não altera o estado de autorização do AGENTS.

## Problema e proposta

Os adapters existentes filtram ator/organização e verificam administração, mas não habilitam RLS. A credencial API continua podendo consultar outras linhas por SQL arbitrário, conforme [persistência](../architecture/persistence.md). O [ADR 0003](../adr/0003-tenant-isolation.md) propõe defesa adicional para dados de domínio, ainda sem tabela de negócio autorizada.

Próxima implementação proposta: prova PostgreSQL em schema descartável exclusivo de testes, exercitando contexto transacional, policies e privilégios. Não criar entidade fiscal, migration de produção, endpoint, helper exportado ou dependência. Não habilitar RLS nas tabelas existentes de identidade, memberships, auditoria ou sessões: suas consultas de bootstrap e administração exigem desenho próprio antes dessa mudança.

Essa prova pode demonstrar DB-01, parte de DB-02, DB-04 e DB-05 da [matriz existente](../engineering/identity-tenancy-test-plan.md), somente para a fixture. Não demonstra isolamento da aplicação, DB-03 de tabelas de controle, revogação concorrente de efeitos de domínio ou E2E fiscal.

## Alternativas

| Opção                               | Resultado e custo                                                         | Avaliação proposta                              |
| ----------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Aguardar primeira tabela de domínio | Menos artefatos agora, riscos de pool/policy descobertos junto do negócio | Válida se a prova não for priorizada            |
| Prova isolada com dados sintéticos  | Evidência de mecanismos PostgreSQL sem alteração de runtime               | Preferida para a próxima etapa técnica          |
| RLS imediato nas tabelas existentes | Afeta lookup global, listagem e administração transacional                | Requer RFC específica e regressão dos contratos |
| Banco por organização               | Segrega operação, mas amplia provisionamento/migrations                   | Sem requisito operacional que justifique agora  |

## Desenho da prova

Fixture cria schema com nome único e três relações técnicas: registros com chave `(tenant_id, id)`, referências com FK `(tenant_id, record_id)` e eventos sintéticos na mesma transação. Dois tenants A/B, IDs conhecidos e valores sem dados reais. Unicidades locais incluem tenant. Esses nomes/modelos são fixtures, não tabelas candidatas de produto.

Conexão owner provisiona e limpa somente seus objetos. Assertions de acesso usam conexão autenticada como role dedicada, não `SET ROLE` sobre superuser. Role runtime sem ownership, superuser, BYPASSRLS, CREATEROLE, CREATEDB ou associação herdada/assumível ao owner; grants explícitos somente para DML exigido, sem DDL, TRUNCATE ou privilégios em schemas da aplicação. Antes de cada grupo, conferir catálogo de roles, ownership, grants e flags de RLS. Precondição incorreta falha o teste, sem skip.

Propor ENABLE e FORCE ROW LEVEL SECURITY nas fixtures, policies específicas para a role e comandos usados, sem policy PUBLIC permissiva adicional. SELECT/DELETE verificam `USING`; INSERT verifica `WITH CHECK`; UPDATE verifica ambos, incluindo tentativas de mudar tenant. Políticas não concedem o GRANT de tabela necessário. [CREATE POLICY](https://www.postgresql.org/docs/18/sql-createpolicy.html) e [GRANT](https://www.postgresql.org/docs/18/sql-grant.html).

Contexto proposto: transação explícita e `SELECT set_config('tax.tenant_id', $1, true)` parametrizado na mesma conexão de todo DML. Expressão candidata: `tenant_id = nullif(current_setting('tax.tenant_id', true), '')::uuid`. Contexto ausente/vazio não autoriza linha; UUID malformado pode abortar a consulta, sem liberar dados. Nome de setting constante, valor validado. Não usar SET de sessão para tenant. [Funções de configuração](https://www.postgresql.org/docs/17/functions-admin.html).

Pool de tamanho 1 precisa demonstrar o mesmo `pg_backend_pid()` entre operações normais, depois de commit, rollback e erro recuperável. Antes de devolver conexão, encerrar transação; se rollback/limpeza falhar, descartar a conexão e comprovar substituição por outra. Contexto de sessão previamente contaminado deve ser detectado e a conexão descartada antes de DML: SET LOCAL restaura o valor de sessão anterior, não garante que ele esteja vazio. O teste deve cobrir esse caso explicitamente. [SET](https://www.postgresql.org/docs/18/sql-set.html).

## Limites de segurança

RLS com setting mutável não autentica ator nem prova membership. Quem possui SQL arbitrário pode tentar mudar o setting e escolher B. A prova deve registrar esse limite com cenário controlado, sem declarar resistência a runtime comprometido. Na adoção futura, aplicação deve resolver identidade verificada e autorizar a organização antes de definir contexto; queries de domínio continuam com escopo explícito. [Opções customizadas](https://www.postgresql.org/docs/18/runtime-config-custom.html).

Superuser/BYPASSRLS continuam fora da defesa; FORCE não os limita. TRUNCATE e verificações de integridade não seguem a mesma filtragem de linhas; constraints podem revelar existência indiretamente. Manter privilégio mínimo e sanitizar erros em futura fronteira HTTP. Prova deve separar negação por falta de GRANT, filtro por USING e violação por WITH CHECK/FK, verificando SQLSTATE sem depender de mensagem localizada. [Row security PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) e [18](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

## Execução, adoção e reversão

Sequência proposta: aceite desta RFC e integração da PR #16; depois documentação de execução, testes Red válidos com role/fixture corretas, implementação SQL mínima, Green e regressões PostgreSQL. Falha de ambiente ou falta de privilégio não conta como Red de isolamento. Plano detalhado em [TDD da prova](../engineering/synthetic-rls-test-plan.md).

Reutilizar `pnpm test:integration` e TEST_DATABASE_URL com banco terminado em `_test`, sem fallback para DATABASE_URL. CI atual usa PostgreSQL 17; ambiente local anterior usa 18. Registrar versão efetivamente executada e não afirmar compatibilidade por leitura de documentação. Nenhuma atualização de versão/CI faz parte desta proposta. Cleanup fecha pools antes de remover somente schema/roles próprios; não usar DROP OWNED de role compartilhada.

Reversão da prova remove fixtures e testes específicos, sem tocar migrations/journal ou tabelas da aplicação. Uma adoção futura exige nova decisão com tabela real autorizada, contrato de contexto, autorização/locks de membership, grants, migration aditiva, negativos HTTP e estratégia de rollback. Nunca desligar RLS de tabela real como atalho para restaurar acesso.

Aceite documental não é autorização de deploy, domínio fiscal ou garantia de isolamento implementado. [Registro desta revisão](../engineering/rls-proposal-validation.md).
