# Plano TDD — recebimento de lote sintético

Status: proposto e não executado; implementação depende do aceite da [RFC 0003](../rfc/0003-synthetic-document-intake.md) e ADR de execução. Não confundir com os 12 cenários já aprovados da prova RLS isolada.

## Fixtures e Red válido

Organizações A/B, ator somente A, ator nos dois escopos, analyst, reviewer, viewer e administrador; vínculo revogado e identidade não provisionada. Somente referências/valores sintéticos. PostgreSQL real isolado via TEST_DATABASE_URL, roles distintas de migrador/runtime e prova dos privilégios antes de testar RLS. Tokens RSA efêmeros; nunca banco de desenvolvimento/produto ou fallback DATABASE_URL.

Escrever o primeiro teste de cada comportamento, observar falha correspondente e implementar mínimo. Falha de conexão, role sem GRANT necessário, migration ausente ou erro de compilação não contam como Red de isolamento. Assertar SQLSTATE, linhas e efeitos, sem depender de texto de erro. Registrar separadamente regressões acrescentadas após implementação; não alegar TDD retroativo.

| ID        | Comportamento e resultado esperado                                                                                                                                                                       | Camada                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| INTAKE-01 | Documento válido e limites inclusivos preservam inteiros, referência e ordem; strings/negativos/fracionários/extras/duplicados/excesso são rejeitados; total divergente continua aceito estruturalmente  | Domínio/contrato           |
| INTAKE-02 | Sem access, MFA/ID token, identidade não provisionada, vínculo revogado ou organização B indevida não produzem efeito; viewer/reviewer não criam                                                         | HTTP/aplicação             |
| INTAKE-03 | POST válido retorna 201; GET autorizado retorna somente contrato fechado; ID B em organização A permitida retorna o mesmo 404 de ausente                                                                 | HTTP/PostgreSQL            |
| INTAKE-04 | Mesmo tenant/ator/chave/comando retorna 200 e mesmo ID/data, mesmo com ordem diferente de propriedades JSON; sem novo lote/evento. Conteúdo ou ordem de arrays diferentes gera 409                       | Aplicação/PostgreSQL       |
| INTAKE-05 | Mesma chave em B ou com outro ator autorizado não colide com A; replay revalida papel e vínculo antes de devolver sucesso                                                                                | Aplicação/PostgreSQL       |
| INTAKE-06 | Criações simultâneas com a mesma chave confirmam só um lote/evento; resultado incerto é reconciliável pela repetição idempotente explícita                                                               | Concorrência PostgreSQL    |
| INTAKE-07 | Runtime autenticado sem bypass/ownership usa ENABLE/FORCE; SELECT sem filtro de fixture técnica das novas tabelas retorna só A. INSERT B com contexto A e FK cruzada falham sem efeito                   | PostgreSQL real            |
| INTAKE-08 | Sem contexto, vazio ou UUID inválido falham fechado; A → commit/rollback/erro → B no mesmo PID não vaza; contaminação e rollback impossível descartam conexão                                            | PostgreSQL/pool            |
| INTAKE-09 | Falta de INSERT na auditoria reverte lote/documentos/linhas; runtime não lê, altera, apaga ou trunca eventos e não modifica dados de controle                                                            | PostgreSQL real            |
| INTAKE-10 | Operação e revogação/rebaixamento compartilham locks. Operação autorizada conclui antes da revogação; quem aguardou revogação/rebaixamento revalida e nega. Observar bloqueio real, sem sleep como prova | Concorrência PostgreSQL    |
| INTAKE-11 | Corpo maior que 16 KiB com Content-Length e chunked, JSON/tipo de mídia/chave/query inválidos são rejeitados antes de escrita; errors/request ID/no-store consistentes                                   | HTTP compilado             |
| INTAKE-12 | Falha de storage, lock ou auditoria retorna 503 sem SQL, identidade externa, chave, valores ou corpo em logs/traces/respostas; setting mutável continua documentado como limite                          | Integração/observabilidade |

GET também participa do protocolo de autorização; teste leitura bloqueada durante revogação e negação após seu commit. Deduplicação não substitui autorização, e eventos devem referenciar tenant/ator/recurso/request ID internos sem copiar o documento. Migration/constraints e rollback da aplicação precisam de ensaio com dados sintéticos existentes.

## Validação após implementação

Domínio puro, HTTP real, integração PostgreSQL das tabelas novas e API compilada com runtime restrito; regressões existentes de login/administração, lint, tipos, cobertura, build e scans. BFF/UI e E2E com novo efeito não fazem parte do primeiro recorte API; continuar como pendência explícita. Checks dependentes de ambiente só contam quando executados; docs apenas por links, formato e coerência.

Nenhum caso da tabela foi executado nesta preparação. DB-03 das tabelas de controle, diagnóstico e importação real continuam pendentes, mesmo se esta matriz futura passar.
