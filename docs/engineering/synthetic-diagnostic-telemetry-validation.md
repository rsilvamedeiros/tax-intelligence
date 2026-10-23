# Validação — Telemetria do diagnóstico sintético

Data: 23/10/2026. Recorte do [ADR 0028](../adr/0028-synthetic-diagnostic-telemetry.md), na PR #33, dependente da interface da PR #32. PR #31 integrada; #32 direcionada para main e pronta para revisão humana. CI aprovado em 178499a; revisão externa pendente por limite do serviço.

## Mudança e TDD observado

O log HTTP acrescenta traceId somente para contexto válido do SDK. Atributos do span continuam exclusivamente rota template e status; nenhum novo acesso SQL ou dado de negócio na telemetria. Sem SDK, traceId não aparece.

`pnpm --filter @tax/api test --runTestsByPath src/app.spec.ts`: Red com 1 falha/12 aprovados, exclusivamente pela ausência do traceId esperado; após implementação mínima, 13 aprovados. O teste existente sem SDK foi ampliado para exigir ausência de traceId. A prova de exportação valida instrumentação preexistente e a correlação nova; não se apresenta como novo TDD de toda a instrumentação.

## Prova integrada real

`pnpm test:integration:synthetic-diagnostic-http`, com TEST_DATABASE_URL `_test`, PostgreSQL 18.1 local, login temporário NOINHERIT/NOBYPASSRLS, API compilada, JWT RSA e JWKS local, passou. Collector HTTP JSON somente em loopback, porta efêmera, exportação opt-in e polling limitado a 10 segundos. Cleanup encerra processo/collector e remove fixtures/role.

Cada requisição registrada exige exatamente um log pelo request ID retornado e exatamente um span exportado pelo traceId. JSON OTLP é decodificado: nome, rota template esperada, status HTTP, status ERROR em 503, whitelist de atributos e ausência de eventos/links. Resource/scope são inspecionados: nome de serviço, whitelist de metadados padrão do SDK e ausência de atributos no scope. Metadados técnicos padrão de host/processo não equivalem a uma política de retenção/acesso aprovada para produção.

Fluxo real preservado: POST concorrente 201/200 com um resultado/evento, consulta 200, ausência/tenant/papel 401/403/404, credencial com grant excessivo 503, recuperação e revogação. A whitelist impede valores/documentos nos logs e atributos de requisição; sentinelas confirmam ausência de token, senha, identidade externa, atores, organizações, lote, execução, referência, URL, query e body em todo o JSON exportado e logs capturados. IDs técnicos de trace/request continuam permitidos.

## Verificações locais

Lint e tipos aprovados; 928 testes de aplicação com cobertura (154 contratos, 364 API, 175 componentes web, 235 BFF), sem reduzir limiares. 144 testes PostgreSQL em 10 suítes aprovados. Build completo e smokes reais de OTLP/autenticação aprovados; auditoria sem vulnerabilidades conhecidas. Checagem de cleanup confirmou ausência de roles, lotes, execuções/eventos e funções temporárias. Links/formato e revisão final são registrados após o fechamento documental.

Navegador/Keycloak local não executado nesta etapa: Docker/Java não estão disponíveis no PATH. A evidência de navegador da interface continua na [validação do ADR 0027](synthetic-diagnostic-ui-validation.md); nova execução deve vir do CI, sem atribuir o teste local API/RSA a um browser real.

## Matriz de aceite da vertical demonstrativa

Fechamento local: 118 Markdown e 16 manifests validados; `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, cobertura serializada, build, smokes, integração e audit aprovados. Skill code-review aplicada em autorrevisão estática, segurança e arquitetura: sem achado bloqueante identificado. Isso não constitui revisão independente nem aceite humano. Nenhuma dependência, migration ou permissão de runtime foi alterada.

| Critério                                              | Evidência disponível                                         | Limite / decisão restante                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Login, organização, lote e diagnóstico pela interface | Jornada real Keycloak/Chrome/PostgreSQL da PR #32            | PR #32 aberta no início; integração e aceite humano separados                         |
| Resultado exato, persistência, replay e auditoria     | Núcleo, casos de uso e PostgreSQL dos ADRs 0022–0025         | Somente regra/fixtures demonstrativas                                                 |
| Recuperação após efeito incerto e limpeza de contexto | UI/BFF e jornada real do ADR 0027                            | Não comprova homologação fiscal                                                       |
| Autorização/isolamento sintético                      | Negativas de tenant/papel e RLS nas seis relações sintéticas | Controle e futuros dados reais sem RLS implementado                                   |
| RUN-20: exportação da operação sem payload sensível   | Prova local e CI API/RSA/PostgreSQL/collector desta entrega  | Revisão externa pendente; sem trace distribuído web/API                               |
| Operação e primeira vertical fiscal real              | Não implementadas                                            | Fontes, vigência, autorização, segurança e revisão especializada exigem etapa própria |

A evidência técnica sintética pode ser apresentada para aceite após integração/revisão. Não declara aprovação humana nem prontidão de produção. Próximo ponto de decisão: revisão do aceite demonstrativo e definição documental de uma fonte/contexto real autorizado, antes de implementar importação ou regra fiscal.

## CI e revisão externa

[Execução 40016144905](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/40016144905), head 178499a: oito checks aprovados, incluindo GitGuardian e scanners. PostgreSQL 17.11: 144 testes/10 suítes e serviços compilados de lote/diagnóstico/HTTP aprovados. Prova OTLP específica aprovada no mesmo job; navegador real com Keycloak, Cypress 16.1.1 e Chrome 155 headless: authentication.cy.ts aprovado, incluindo a jornada UI existente. Isso é evidência remota; browser/Keycloak local permanece não executado.

Autorrevisão posterior endureceu o parser de logs para considerar apenas linhas completas durante polling, evitando falha por chunk parcial de stdout. Integração API/RSA/PostgreSQL/OTLP repetida localmente e aprovada; cleanup confirmado e cluster próprio encerrado. Não houve mudança adicional de runtime.

Revisão CodeRabbit solicitada uma vez na [PR #33](https://github.com/rsilvamedeiros/tax-intelligence/pull/33#issuecomment-6373640661). O serviço informou limite gratuito atingido e próxima janela em 28 minutos no momento da resposta. Nenhuma revisão efetiva concluída nesta entrega; status verde do bot não equivale à revisão. Sem alterar plano, billing ou configuração remota. Revisão externa e aceite humano permanecem pendentes.

Continuidade em 23/10/2026: PR #32 integrada; #33 direcionada a main e retirada de draft, sem merge. [Nova solicitação](https://github.com/rsilvamedeiros/tax-intelligence/pull/33#issuecomment-6374135174) aceita após a janela anterior; revisão 5634187386 concluída no head afa4c7e. Único achado acionável, menor, comentário 4364028618: a seção Estado concreto da arquitetura ainda listava a prova OTLP como pendente. Contradição conferida e removida, preservando as demais pendências e referências. Validação documental/formato executada para a correção; não há alteração de runtime nem novo ciclo TDD de aplicação. Aceite humano continua separado.
