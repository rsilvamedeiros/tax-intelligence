# ADR 0021 — Interface do lote sintético

Data: 21/10/2026. Status: próxima etapa solicitada pelo mantenedor; depende da PR #24, aberta no início desta entrega. Comparar a branch à base dessa PR até sua integração e então direcionar a main, sem merge automático.

## Recorte autorizado

Interface de criação e consulta de lotes pelos contratos BFF do ADR 0020. Montar somente em organização selecionada, com sessão pública/CSRF atual. Administrador e analista veem criação; quatro papéis ativos veem consulta por identificador. Visibilidade não autoriza: API continua revalidando o vínculo em cada operação. Sem listagem, edição/exclusão persistida, novo endpoint, SQL pela web, diagnóstico, cálculo ou fonte fiscal real.

Formulário acessível para 1–10 documentos: referência, total declarado em centavos inteiros e 1–10 valores de linhas, separados por vírgula. Validar strings decimais inteiras antes de Number e schema compartilhado antes de enviar. Não somar linhas ou inferir divergência. Mostrar recibo/identificador e detalhe mínimo, com rótulo de dados sintéticos sem validade fiscal. Consulta exige UUID; zero resultado 404 é estado próprio, falhas são genéricas e não reproduzem erro upstream.

## Intenção, recuperação e contexto

Cada intenção válida recebe UUIDv4 criado no navegador, sem storage persistente. Enviar JSON normalizado, Idempotency-Key e CSRF somente ao BFF. Bloquear edição e novas criações enquanto há request pendente ou efeito incerto. Rede, 5xx, status inesperado ou recibo inválido podem seguir commit: conservar comando/chave em memória e oferecer repetição explícita do mesmo comando, sem retry automático ou abandono silencioso para outra chave. Após sucesso 201/200, exigir Preparar novo lote antes de liberar outra intenção e limpar o rascunho; isso também bloqueia duplo clique cuja segunda ação chega depois da resposta. Conflito 409 exige nova seleção de contexto para reconciliar, sem trocar chave automaticamente.

Abortar requests no desmonte e ignorar respostas tardias, inclusive depois de await json. Remontar a fronteira por organização, sessão/CSRF e papel, limpando formulário, intenção, recibo e detalhe. 401 invalida conta; 403 remove dados/controles do contexto e exige nova seleção. Nenhum token, cookie de tenant ou documento em localStorage/sessionStorage. Consulta tem cancelamento próprio; criar/consultar são serializados para evitar sobrescrever estado.

## Plano e aceite

Documentação → Red comportamental RTL de criação ausente → Green mínimo → Red de repetição com chave preservada → Green → consulta, falhas e troca de contexto. Registrar regressões separadamente de Red observado. Testar semântica de formulário, validação/limites, 200/201, 401/403/404/409/5xx, resposta inválida/tardia, duplo envio, desmonte/troca de contexto, papéis e axe. Labels/legends e status/alerts, foco visível e layout responsivo reutilizam tokens existentes, sem nova biblioteca.

Estender jornada Keycloak/Chrome real com criação pelo formulário, recibo, consulta, isolamento, limpeza por troca de organização e sessão, além das regressões BFF/administração. Dados e PostgreSQL isolados; não declarar execução local de navegador sem ambiente. Executar lint, tipos, cobertura, build, smokes, integração e checks documentais; revisão local é autorrevisão, revisão externa é evidência separada. Aprovação humana antes de merge. Reversão remove consumidor UI e preserva dados/auditoria. Diagnóstico demonstrativo requer etapa própria; primeira vertical fiscal e produção não estão concluídas por esta interface.
