# Validação da consulta administrativa de membros

Escopo e aceite: [ADR 0013](../adr/0013-administrative-membership-directory.md).

## Plano

Registrar falhas por capacidade ausente antes de implementar cada fronteira. Executar contratos/serviço/HTTP, PostgreSQL isolado com runtime não proprietário, API compilada com RSA, regressões e checks estáticos. Publicar resultados reais e revisão remota antes de considerar a etapa pronta para aprovação humana.

## Evidências

Documentação e escopo em AGENTS registrados em commits antes dos testes/código.

| Fronteira  | Red observado                                                            | Green inicial |
| ---------- | ------------------------------------------------------------------------ | ------------- |
| Contrato   | Schema provisório never e OpenAPI vazio: 2 falhas, 5 negativos já passam | 7 testes      |
| Serviço    | Método provisório rejeita a capacidade ausente: 7 falhas                 | 7 testes      |
| HTTP       | Rota ausente retorna 404 e não publica operação: 15 falhas               | 15 testes     |
| PostgreSQL | Adapter provisório retorna negação: 4 falhas, 4 negativos já passam      | 8 testes      |

Primeira execução PostgreSQL excedeu timeout de 5s na preparação/limpeza da fixture durante outras verificações locais. Não é Red comportamental. Repetição isolada com os mesmos limites produziu o Red legítimo descrito acima; nenhum timeout ou assertion foi relaxado.

Teste adicional de leitura durante revogação não confirmada e integração com API compilada foram escritos após a implementação; são verificação complementar, não TDD retroativo.

## Regressões locais

| Verificação                            | Resultado                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm lint                              | Aprovado, sem warnings                                                                                                                                                       |
| pnpm typecheck                         | Aprovado em todos os pacotes                                                                                                                                                 |
| pnpm test:coverage --concurrency=1     | 294 testes: API 176, contratos 35, web 38, BFF 45; thresholds preservados                                                                                                    |
| pnpm test:integration                  | 70 testes em PostgreSQL 18.1 isolado; 9 da consulta administrativa                                                                                                           |
| pnpm build                             | API, web e pacotes aprovados                                                                                                                                                 |
| pnpm test:integration:membership       | API compilada, JWT RSA efêmero e PostgreSQL restrito: paginação/estado revogado, 401/400/403/503, perda de acesso com token válido, regressões de escrita e logs sanitizados |
| pnpm test:smoke                        | Autenticação RSA e exportação OTLP reais aprovadas                                                                                                                           |
| pnpm test:e2e                          | 2 jornadas de fundação em Chrome aprovadas                                                                                                                                   |
| pnpm audit:dependencies                | Exit 0, uma vulnerabilidade moderada; nenhuma high/critical                                                                                                                  |
| pnpm format:check / pnpm validate:docs | Aprovados; 80 Markdown e 16 skills                                                                                                                                           |

Jornada autenticada com Keycloak não foi repetida localmente nesta etapa, sem mudanças no browser/BFF; deve ser conferida no job identity-provider. Não declarar esse resultado local como executado. PostgreSQL de teste iniciado e encerrado pela tarefa; fixtures próprias removidas. Nenhuma aplicação do usuário foi encerrada.

## Revisão e limites

Revisão local do diff: parâmetros SQL, autorização com página vazia, snapshot único, projeção mínima, status fechado, composição e erro sanitizado; sem achado bloqueante identificado. Não substitui revisão independente ou aprovação humana de autorização.

Sem migration, novo grant SQL, dependência ou acesso DB pela web. BFF/UI administrativos, reativação e RLS continuam pendentes. Leitura em andamento pode concluir pelo snapshot; paginação entre requisições não congela concessões concorrentes. Deploy e merge automático não realizados.

Checks remotos e revisão independente ainda pendentes; registrar evidência antes de declarar o PR pronto.
