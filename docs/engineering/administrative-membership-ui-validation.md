# Validação da interface administrativa de membros

Escopo: [ADR 0015](../adr/0015-administrative-membership-ui.md). Base: PR #15 integrada, main `82a1eb8`.

## Plano

Documentação e AGENTS primeiro. Executar RTL Red/Green por comportamento e verificar composição com contexto/sessão. Cobrir estados e falhas de transporte, autorização, confirmação, cancelamento e acessibilidade. Estender jornada real sem substituir checks existentes. Executar verificações locais, revisar diff e acompanhar checks/revisão remotos antes da entrega.

## Evidências

Componente provisório vazio: 20 testes falharam pela ausência dos estados/controles, não por import ou toolchain. Primeira implementação: 19 aprovados e uma falha real no retorno do foco após cancelar revogação; botão ainda estava desabilitado antes do commit React. Correção restaura foco no efeito após render. Composição: um cenário administrativo falhou pela ausência do painel e quatro passaram; implementação monta somente com contexto organization_admin verificado e CSRF público da sessão.

Após Green, foram adicionadas quatro regressões complementares de negação inicial, erro de rede e resposta 401 após unmount; não atribuir TDD retroativo a esses testes ou à extensão Cypress. Cobertura final: 364 testes, sendo 176 API, 35 contratos, 64 componentes/rotas web e 89 BFF. Metas preservadas; componente administrativo com 100% de linhas/funções e 95,89% de branches. Axe não reportou violações automatizadas no estado de confirmação; isso não equivale a avaliação humana com leitor de tela.

Lint, tipos e build aprovados. A checagem de tipos encontrou inicialmente duas referências de mock sem garantia de índice e IDs Cypress tipados como lista de tamanho variável. Corrigidas somente as referências/fixture tipada com três atores e verificação de tamanho, sem reduzir assertions. Formato corrigido após essa edição; verificação completa aprovada. Documentação validada: 84 Markdown e 16 skills. PostgreSQL real isolado: 70 testes aprovados. Smokes de API compilada/RSA e OTLP aprovados. Audit: exit 0, uma vulnerabilidade moderada, sem high/critical.

Revisão local aplicada: contratos fechados, nenhum token no cliente, CSRF da sessão atual, URL derivada de contexto/UUID, dados e controles removidos em 401/403, consulta obrigatória após resposta ambígua, escrita serializada e AbortController com descarte de respostas tardias. Confirmação acessível sem dependência nova. Nenhum achado bloqueante remanescente; não substitui revisão independente ou humana.

Jornadas locais Chrome 152: dois cenários de fundação e uma jornada autenticada com Keycloak 26.8.0 aprovados. Jornada usa controles visíveis para conceder, trocar papel, cancelar/confirmar revogação e retirar controles após auto-rebaixamento; preserva negativos de origem/CSRF, acesso cruzado, idempotência, conflito de reativação e logout. Serviços de teste pertencentes à tarefa encerrados após execução; processos existentes do usuário preservados.

Revisão/checks remotos ainda pendentes. Não há validação de produção nem autorização para etapa fiscal. Sem migration, dependência ou privilégio de banco novo.
