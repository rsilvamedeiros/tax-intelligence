# Validação da interface de diagnóstico sintético

Etapa do [ADR 0027](../adr/0027-synthetic-diagnostic-ui.md), em 23/10/2026, dependente da PR #31, aberta no início. Workspace compõe lote e diagnóstico por organização/sessão/papel, sem nova API, permissão, dependência, migration ou cálculo em React.

## TDD e regressões

Três ciclos Red/Green observados em ambiente válido: stub sem criação por lote; falha de rede sem recuperação explícita; dois casos de atalho que permitiam substituir intenção incerta e não restauravam o mesmo lote após nova intenção explícita. Correções: formulário pelo BFF; body conservado/repetição; bloqueio compartilhado dos atalhos e revisão de seleção para remonte explícito, inclusive com o mesmo ID. Demais negativos são regressões, não Reds individuais.

53 testes novos cobrem papéis, payload mínimo/CSRF, UUIDs, replay/consulta explícita, tabela de evidência, erros/saídas inválidas, recibo associado ao lote, detalhe associado ao ID/recibo, serialização, body estável, 401/403, ausência uniforme 404, respostas tardias antes/depois de json(), troca de organização/CSRF/papel/lote, unmount, atalhos e foco. Negação em lote ou diagnóstico remove os dois painéis do workspace. Axe em estados vazio/evidência não encontrou violações; isso não substitui inspeção humana por leitor de tela.

Falhas de ferramenta/teste corrigidas sem alegar Red de implementação: matcher de axe não configurado, substituído pela verificação de violations; typecheck rejeitou dois mocks parciais de Response, corrigidos com spy na fronteira json(). Nenhum any, teste removido ou limiar reduzido.

## Evidências locais

- Node 24.21.0, pnpm 10.24.0. `pnpm lint` e `pnpm typecheck` aprovados.
- `pnpm exec turbo test:coverage --concurrency=1`: 927 testes aprovados (154 contracts, 363 API, 175 web, 235 BFF), incluindo 53 novos. Componente novo com 100% de linhas/funções e 95,79% de branches nessa execução; cobertura não aprova isolamento sozinha.
- `pnpm build`, `pnpm test:smoke`, `pnpm audit:dependencies`: aprovados, nenhuma vulnerabilidade conhecida retornada pela auditoria. Smokes existentes cobrem autenticação/OTLP geral, sem alegar trace específico do diagnóstico.
- `pnpm test:integration`: 144 testes/dez suítes em PostgreSQL 18.1 isolado via TEST_DATABASE_URL `_test`. Cleanup verificou ausência de roles/lotes/execuções/eventos/funções de falha; cluster iniciado pela etapa foi encerrado.
- Jornada local Keycloak/Chrome não executada; ambiente local não possui Docker/Java no PATH. CI foi estendido para provar atalho do lote consultado → submit por Enter → commit real com resposta substituída por 503 → replay do mesmo body → evidência e proveniência → tabela focável com overflow em viewport estreita → nova intenção/contexto → viewer consulta sem criar → logout limpa a UI. Somente a resposta percebida pelo navegador é alterada no cenário incerto; API e transação permanecem reais.

Formato e links de 116 documentos/16 manifests aprovados; diff sem erros de whitespace. Autorrevisão de contratos, contexto, cancelamento, recuperação e acessibilidade sem achado bloqueante identificado. CI e revisão externa pendentes na abertura da PR; autorrevisão não substitui aceite humano. Tokens de acesso permanecem exclusivamente no servidor; o CSRF público vem da fronteira de sessão. Componentes só chamam caminhos BFF e validam contratos públicos.

## Limites e próximo ponto de decisão

Interface sintética implementada em branch, ainda não integrada. Dados/resultados existem só em memória do contexto visual; API mantém persistência/auditoria. Troca de organização/sessão ou outra referência escolhida explicitamente desmonta e cancela a instância anterior; enquanto houver operação ativa ou efeito incerto, atalhos de troca ficam indisponíveis. Nova permissão sempre é decidida pela API.

Próximo módulo proposto: prova OTLP específica da jornada e revisão do aceite da primeira vertical demonstrativa. Sem regra tributária real, fonte externa, importação real, produção, deploy ou merge automático. A existência da tela não significa prontidão fiscal nem validação completa da vertical.
