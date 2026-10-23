# ADR 0027 — Interface do diagnóstico sintético

Data: 23/10/2026. Status: próximo módulo solicitado, em branch dependente da PR #31, aberta no início. Autoriza interface de criação/replay/consulta pelo BFF do ADR 0026. Sem cálculo em React, nova API/permissão, persistência no navegador, dados fiscais reais, deploy ou merge automático.

## Jornada e composição

No contexto de organização verificado, workspace compõe lote e diagnóstico. Administrador/analista pode usar explicitamente um lote criado/consultado ou informar UUID conhecido; envia exclusivamente `{batchId}` ao BFF com CSRF da sessão. Não gera Idempotency-Key, regra, versão, ator ou valor calculado. Recibo 201/200 preenche consulta por executionId; leitura do resultado é explícita. Quatro papéis ativos consultam por identificador. API continua autorizando e validando evidência; controles visuais não concedem permissão.

Exibir recibo, lote de origem, regra/versão, proveniência de fixture, aviso de ausência de validade fiscal e evidência por documento em tabela semântica: referência, linhas, total declarado, soma, diferença e resultado fornecidos pela API. Sem recalcular soma/diferença/outcome ou inferir parecer tributário. Schemas fechados validam transporte; recibo deve referir o lote solicitado e detalhe deve ter o ID consultado. Não interpolar HTML fornecido pelo servidor.

Criação, consulta e repetição são serializadas. Falha de rede, 503, status inesperado ou recibo inválido pode ocorrer depois do commit: congelar referência do lote, conservar o mesmo body e oferecer repetição explícita, sem retry automático. 400/413/415 e lote ausente 404 permitem corrigir a referência. Após recibo, outra intenção exige ação explícita; replay natural não cria outro resultado/evento. Consulta indisponível oferece nova tentativa pelo mesmo identificador, sem repetir POST.

Mudança de organização, sessão/CSRF, papel ou lote escolhido pelo atalho desmonta instância anterior, aborta requisições e ignora respostas tardias, inclusive durante json(). 401 limpa dados e encerra fronteira de conta; 403 limpa dados/controles do workspace e exige selecionar organização novamente. Estado somente em memória, sem tokens, localStorage, sessionStorage, cookie de tenant ou novo acesso SQL da web.

## Acessibilidade, riscos e aceite

Labels e descrições associados, loading/status anunciados, erros em alertas, tabelas com caption/cabeçalhos, navegação por teclado e foco previsível. Atalho de lote e ação de preparar nova intenção levam foco ao campo de referência; resultados não roubam foco. Reutilizar tokens/estilos existentes, sem nova biblioteca ou componente genérico sem consumidor.

Documentação → stub válido → Red de criação por lote → Green → Red de recuperação mantendo body → Green → negativos/regressões. RTL com dublês apenas do transporte, axe e testes de integração de composição; sem mocks como prova de tenant/sessão. Cobrir papéis, entrada/saída inválidas, 401/403/404, indisponibilidade, duplo submit, corpo estável, fronteira de contexto, unmount e resposta tardia. Extensão da jornada real Keycloak/Chrome/PostgreSQL: atalho do lote → criar → consultar evidência → efeito incerto após commit recuperado por replay → viewer consulta sem criar → logout limpa a interface. Somente fixtures sintéticas e TEST_DATABASE_URL `_test`.

Riscos principais: dado antigo reaparecer em outro contexto e falha incerta gerar intenção diferente; negativos bloqueantes. Verificar lint/tipos/cobertura/build/smokes/formato/links e CI; revisão estática/arquitetura/segurança local é autorrevisão. Revisão externa e aceite humano continuam separados. Reversão remove consumidor UI, preservando BFF/API/execuções/eventos/RLS. Prova OTLP específica e validação da vertical completa permanecem posteriores; sem afirmar prontidão fiscal/produção.
