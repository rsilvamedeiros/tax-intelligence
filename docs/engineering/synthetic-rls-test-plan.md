# Plano de TDD da prova sintética RLS

Status: matriz executada na prova isolada do [ADR 0016](../adr/0016-synthetic-rls-proof.md), com 12 cenários aprovados localmente e [evidências de Red/Green e regressões](synthetic-rls-validation.md). CI e revisão ainda pendentes nesta etapa. Escopo e limites na [RFC 0002](../rfc/0002-synthetic-rls-proof.md); execução da fixture não comprova isolamento da aplicação.

## Preparação e Red válido

Owner provisiona objetos exclusivos no banco `_test`. Duas conexões distintas: owner para fixture e login restrito para assertions, com pool runtime de tamanho 1. Fixtures A/B e relações técnicas descritas na RFC; nenhum dado fiscal, usuário real ou alteração de roles da aplicação.

Antes de alegar Red, confirmar conexão, versão, schema, role/grants e dados. Cenário mínimo sem RLS deve falhar porque consulta sem filtro retorna A e B; adicionar policy/ativação mínima e observar Green. Red de WITH CHECK exige SELECT já correto e INSERT/UPDATE concedidos: falhar por falta de GRANT não demonstra a policy. Caso de FK precisa passar pela policy antes de falhar na referência composta. Não commitar estados quebrados apenas para separar teste e implementação.

## Matriz proposta

| Caso   | Operação e observação exigida                                                       | Aceite / limite                                                                                     |
| ------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| RLS-01 | Ler sem WHERE sob contexto A, incluindo contagem e busca por ID conhecido de B      | Apenas linhas A; B ausente                                                                          |
| RLS-02 | Ler/escrever sem contexto e com contexto vazio; valor inválido em consulta separada | Nenhuma linha visível/modificada; erro aborta sem vazamento                                         |
| RLS-03 | INSERT de B sob contexto A com grant correto                                        | Violação de policy; nenhuma escrita/evento confirmado                                               |
| RLS-04 | UPDATE de linha A para tenant B; UPDATE/DELETE de ID B sob A                        | Troca rejeitada; B permanece intacto; diferenciar erro e zero linhas                                |
| RLS-05 | Referência A para registro que só existe em B                                       | FK composta rejeita vínculo; policy não oculta o motivo sob teste                                   |
| RLS-06 | A → commit → sem contexto → B na mesma conexão                                      | PID igual e nenhuma linha A residual; B isolado                                                     |
| RLS-07 | A → rollback ou erro SQL → rollback → sem contexto → B                              | PID igual após erro recuperável; sem efeitos parciais/contexto residual                             |
| RLS-08 | Contexto de sessão A contaminado antes da próxima operação                          | Detectar e descartar antes de DML; nova conexão limpa, sem aproveitar A                             |
| RLS-09 | Falha controlada de rollback/limpeza de conexão pertencente ao teste                | Conexão descartada; próxima usa outro PID e contexto limpo                                          |
| RLS-10 | Negar escrita no evento sintético após alteração do registro                        | Rollback do registro e ausência do evento; prova somente da fixture                                 |
| RLS-11 | DDL, TRUNCATE, SET ROLE owner e acesso a schema da aplicação pelo runtime           | Falha de privilégio; nenhum bypass concedido                                                        |
| RLS-12 | Runtime muda manualmente setting de A para B com SQL arbitrário                     | Registrar que a policy pode então admitir B; limite conhecido, sem alegação de autenticação por GUC |

RLS-06/07 verificam `pg_backend_pid()` e estado efetivo, não apenas string de configuração. RLS-08/09 verificam descarte real e fechamento de pools no cleanup. Não encerrar backend externo: qualquer falha induzida usa exclusivamente conexão criada pela fixture. Não usar sleep como prova de ordenação nem mock de SQL como evidência RLS.

## Relatório e conclusão futura

Registrar por caso: precondições, comportamento que causou Red quando aplicável, mudança mínima e Green, SQLSTATE relevante, versão do servidor e role efetiva sem senha/URL completa. Conferir rowsAffected e consultar estado com owner só para verificar invariantes/rollback, nunca para demonstrar filtragem.

Rodar integração completa existente e CI; manter thresholds. Os testes de autorização/administração atuais continuam necessários e não passam a validar RLS por associação. Futuro relatório deve declarar quais DB-01/02/04/05 foram demonstrados somente na fixture, preservar DB-03 e efeitos reais como pendências e registrar revisão humana. Sem HTTP novo, não criar E2E artificial para uma fixture privada.
