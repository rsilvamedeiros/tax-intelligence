# Plano de TDD — Execução registrada do diagnóstico sintético

Recorte BFF do [ADR 0026](../adr/0026-synthetic-diagnostic-bff.md): partes de RUN-19 implementadas em handlers/rotas e jornada de sessão existente; [evidências](synthetic-diagnostic-bff-validation.md). Interface de diagnóstico e RUN-20 de OTLP específico permanecem pendentes.

Etapa HTTP do [ADR 0025](../adr/0025-synthetic-diagnostic-http.md) exercita RUN-17/18 por contrato e API compilada/PostgreSQL; [evidências](synthetic-diagnostic-http-validation.md). BFF de RUN-19 acrescentado no ADR 0026; interface de RUN-19 e RUN-20 (OTLP específico) continuam pendentes.

Persistência implementada nesta etapa no [ADR 0024](../adr/0024-synthetic-diagnostic-persistence.md): snapshot público, transação, RLS/grants e auditoria exercitados em PostgreSQL real. [Evidências](../engineering/synthetic-diagnostic-persistence-validation.md). O recorte do ADR 0023 e a proposta original abaixo são históricos; runtime, HTTP, BFF/UI e OTLP específicos permanecem pendentes.

Data: 22/10/2026. Status: **execução parcial em contratos/application**, conforme [ADR 0023](../adr/0023-synthetic-diagnostic-use-cases.md) e [validação](synthetic-diagnostic-use-cases-validation.md). Persistência/locks/RLS, runtime, HTTP e navegador de diagnóstico continuam planejados. A [RFC 0004](../rfc/0004-synthetic-diagnostic-execution.md) permanece proposta para decisões de banco/grants. O núcleo puro do ADR 0022 e os dublês de portas de application não provam autorização ou persistência reais.

## Matriz de comportamento e risco

| ID     | Aceite observável                                                                                                                                            | Fronteira                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| RUN-01 | Entrada só por referência ao lote; documentos/ator/regra/versão arbitrários e campos extras rejeitados, UUIDs canônicos                                      | Contrato/application e futuro HTTP                   |
| RUN-02 | Administrador/analista ativo cria; reviewer/viewer não cria nem recebe replay; quatro papéis ativos consultam                                                | Application + PostgreSQL                             |
| RUN-03 | Sem ator/vínculo, revogado ou papel inválido é denied antes do lock e antes de consultar lote/execução                                                       | PostgreSQL, observação do lock e portas              |
| RUN-04 | A não lê lote/execução de B; após autorização, ausente e externo são not_found indistinguíveis                                                               | PostgreSQL + futuro HTTP                             |
| RUN-05 | Primeira execução preserva ordem, regra 1.0.0, totais e evidência exatamente equivalentes ao núcleo puro; recibo tem referência/data UTC                     | Núcleo + persistência real                           |
| RUN-06 | Mesmo tenant/lote/regra/versão produz um recibo e evento, inclusive com dois atores autorizados; evento conserva iniciador e requestId originais             | PostgreSQL concorrente                               |
| RUN-07 | Mesmo batchId/key natural em outra organização não revela execução; nova versão futura não sobrescreve resultado anterior                                    | Constraints + RLS; versão futura via fixture isolada |
| RUN-08 | Repetições simultâneas coordenadas por barreira produzem uma execução/evento, sem sucesso deduzido de hash ou chave do cliente                               | PostgreSQL concorrente                               |
| RUN-09 | Falha no evento, resultado ou commit reverte tudo; falha depois do commit recupera recibo sem evento extra                                                   | PostgreSQL e fronteira de transporte                 |
| RUN-10 | Revogação/rebaixamento confirmado enquanto execução aguarda lock impede operação após revalidação; inversa permite concluir antes da revogação               | PostgreSQL, catálogo de locks                        |
| RUN-11 | Sem contexto, vazio, inválido ou contexto de B não permite ler/escrever A nem por SQL sem filtro; FK composta impede referência cruzada                      | Login restrito real, RLS/constraints                 |
| RUN-12 | Login não escreve lote/membership, não lê auditoria/auth_bff, não possui DDL ou privilégios herdados excessivos; asserção falha antes da operação            | PostgreSQL/privilégios                               |
| RUN-13 | Snapshot incompleto, resultado adulterado, regra/versão desconhecida, centavos inexatos ou divergência entre resultado e lote falham fechado; sem regravação | Porta pública Fiscal + persistência                  |
| RUN-14 | Tamanho normalizado acima de 16 KiB falha sem efeito parcial; schema e CHECK de bytes exercitados separadamente com fixture inválida                         | Application + PostgreSQL                             |
| RUN-15 | Pool reutilizado A → commit/rollback/erro → B não vaza tenant; baseline contaminado e rollback impossível descartam conexão                                  | PostgreSQL/pool                                      |
| RUN-16 | Lock, statement, transação e aquisição de conexão respeitam limites do ADR futuro, retornando falha sanitizada sem pendência transacional                    | PostgreSQL + aplicação compilada                     |
| RUN-17 | Configuração ausente não usa pool administrativo/BFF/lote; configuração inválida não vaza URL; shutdown encerra só pool próprio                              | Runtime em etapa própria                             |
| RUN-18 | POST sem corpo/query, 201/200, 401/403/404/503, UUID/contrato fechado, no-store e request ID; nenhuma evidência em erro/log                                  | HTTP real na etapa de exposição                      |
| RUN-19 | BFF/UI não recebe token/SQL; CSRF/Origin, leitura sem permissão, logout/troca de organização e recuperação após falha incerta                                | Etapa posterior de navegador real                    |
| RUN-20 | Exportação OTLP correlaciona nova operação sem documentos, valores, credenciais ou identidade externa em atributos/logs                                      | Smoke específico das futuras rotas                   |

## Execução incremental proposta

Primeiro registrar ADR e fronteira pública Fiscal com transação compartilhada; testes de contrato e application podem usar dublês apenas nas portas externas, sem simular a regra. Observar Red por capacidade ausente em ambiente válido, implementar mínimo e observar Green antes das regressões. Em persistência, primeiro criação/evento atômicos, depois replay natural, leitura isolada e concorrência. Falhas de fixture, credencial, migration ou ferramenta não contam como Red.

Usar somente TEST_DATABASE_URL com banco isolado `_test`, migrations idempotentes e roles descartáveis realmente autenticadas. Versão PostgreSQL 17+ por transaction_timeout; nunca .env/DATABASE_URL como fonte do teste. Cleanup somente IDs/roles criados pelo próprio cenário, sem DDL em instâncias do usuário. PIDs/barreiras e catálogo de locks demonstram ordem, sem sleep como prova de concorrência.

RUN-07 não autoriza aceitar versões do cliente ou implementar motor genérico: uma fixture isolada testa a chave composta, enquanto application continua fixando 1.0.0. RUN-14 pode produzir resultado inválido diretamente na fronteira de persistência para provar o limite; o núcleo autorizado permanece limitado a dez documentos/dez linhas.

Negativos de tenant, papel, integridade e atomicidade são bloqueantes; não remover cobertura nem trocar PostgreSQL por mocks para passar. Regressões do lote, login/administração, núcleo puro, cobertura, lint, tipos, build e scanners continuam obrigatórias. CI de navegador existente não equivale à jornada RUN-19, e smoke OTLP geral não equivale a RUN-20.

## Histórico da preparação documental da PR #27

Nesta entrega só há documentação: sem testes artificiais de Markdown e sem alegação de TDD implementado. Validar links internos, formato, coerência com código/ADRs e diff; registrar resultados locais e remotos na PR. Revisão local é autorrevisão; revisão externa e aceite humano são evidências separadas. Nenhum RUN desta matriz está aprovado por sua mera descrição.

## Recorte de application do ADR 0023

RUN-01 tem schemas e casos negativos; partes de RUN-05/06/13 têm evidência de cálculo, replay e detecção de inconsistência por portas. Negação de porta e falhas simuladas de evento/conclusão exercitam application, sem aprovar RUN-02–16 nas fronteiras PostgreSQL. Não declarar RLS, lock, unicidade concorrente ou rollback real a partir desses testes. As demais etapas permanecem planejadas até execução nos ambientes corretos.
