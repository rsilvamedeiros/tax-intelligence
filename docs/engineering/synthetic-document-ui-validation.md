# Validação da interface do lote sintético

Etapa do [ADR 0021](../adr/0021-synthetic-document-ui.md), em 21/10/2026, sobre o BFF da PR #24 integrada. Criação e consulta usam apenas contratos existentes; nenhuma alteração de banco, API ou autenticação. Diagnóstico e dados fiscais reais continuam pendentes.

## TDD e comportamentos

Quatro ciclos Red/Green observados: criação ausente no componente inicial; recuperação ausente após falha de rede; consulta ausente para leitor; segundo clique após resposta rápida permitia nova intenção. Cada falha comportamental foi observada antes da implementação correspondente. O último ciclo introduziu a ação explícita Preparar novo lote após sucesso. Os demais cenários são regressões, sem alegação de Red individual. Um erro de configuração do matcher axe foi corrigido e não conta como Red.

57 testes do componente e uma integração com OrganizationPanel cobrem criação/recibo, consulta, papéis, limites, valores inteiros sem truncamento, referência única, foco de inclusão/remoção, serialização, chave/comando preservados após efeito incerto, rejeições definitivas, conflito, respostas inválidas/tardias, troca de organização/sessão/papel e 401/403. Axe não encontrou violações nos estados exercitados; não substitui inspeção humana com leitor de tela.

## Evidências locais

- `pnpm test:coverage`: aprovado, incluindo os 58 testes novos; limites de cobertura preservados.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` e `pnpm test:smoke`: aprovados. Smokes verificaram autenticação RSA e exportação OTLP geral, sem sentinelas sensíveis.
- `pnpm test:integration`: 108 testes, nove suítes aprovadas em PostgreSQL 18.1 isolado.
- `pnpm test:integration:membership`: aprovado com API compilada.
- `pnpm test:integration:synthetic-batch`: primeira execução falhou por timeout de inicialização da API. Repetição após os demais jobs, sem alterar código ou timeout, aprovada: pool restrito, criação/replay/conflito, isolamento, papéis persistidos, revogação e auditoria. A causa do primeiro timeout não foi comprovada.
- `pnpm audit:dependencies`: exit 0; um advisory moderado existente. Nenhuma dependência adicionada.

`pnpm format:check`, `node scripts/validate-docs.mjs` e `git diff --check`: aprovados; 102 documentos e 16 manifests de skills validados. Revisão local é autorrevisão estática de segurança, arquitetura e regressões; nenhum achado bloqueante confirmado. Revisão externa solicitada ao CodeRabbit na PR #25, ainda sem resultado publicado nesta atualização; aprovação humana continua necessária.

## Navegador e limites

Jornada Cypress acrescentada ao teste real de autenticação: formulário com dois documentos, rejeição de valor fora do limite sem truncá-lo, criação cuja resposta é substituída por 503 após commit, repetição explícita com mesma chave e replay 200, consulta, limpeza por troca de contexto, leitura como viewer e limpeza no logout. Execução local de Chrome/Keycloak não realizada.

[CI da PR #25](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39629127140), no commit 070746661b29ec27e36d4bfe4e56b95cf99420ef: sete jobs aprovados, incluindo PostgreSQL 17.11 (108 testes/nove suítes), E2E geral e identity-provider com Keycloak/Chrome 155 (uma jornada aprovada, zero falhas). Qualidade, documentação, dependências e secret-scan também aprovados. GitGuardian e commit status externo ainda não publicaram resultado; não declarar esses checks aprovados por inferência.

Fixtures locais verificadas sem papéis temporários, lotes ou eventos restantes; cluster isolado iniciado nesta etapa encerrado.

Somente dados sintéticos e banco isolado por TEST_DATABASE_URL. Comando/chave vivem na memória da sessão visual e se perdem ao sair do contexto; a mensagem de incerteza orienta reconciliar antes de trocar. Não há listagem ou recuperação persistente de rascunhos. A UI não calcula totais, não decide autorização e não implementa diagnóstico, importação real ou operação fiscal de produção.
