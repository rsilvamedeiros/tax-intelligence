# ADR 0015 — Interface administrativa de membros

Status: etapa autorizada pelo mantenedor ao solicitar a próxima entrega após integração da PR #15. Implementar somente a interface sobre os contratos dos ADRs 0013/0014; identidade nova, reativação, RLS e ações fiscais permanecem pendentes.

## Decisão e limites

Exibir administração dentro da organização selecionada quando o contexto verificado retorna organization_admin. Essa condição é apresentação, não autorização: cada leitura/alteração continua sendo autorizada pela API. Receber CSRF da sessão pública existente, sem token no cliente ou acesso SQL adicional. Não persistir seleção, membros ou formulários em storage.

Listar página de 25 membros com UUID, papel e estado, usando schema estrito existente. Oferecer atualização, páginas anteriores/próximas, vazio, loading, indisponibilidade e recuperação. Conceder acesso somente por UUID de ator existente, sem busca global ou criação de identidade. Selecionar papel por opção fechada. Alterar papel e revogar somente vínculo ativo; revogação exige confirmação explícita acessível. Vínculo revogado não oferece reativação.

Serializar ações na interface; não realizar atualização otimista ou repetição automática. Após 204, consultar a primeira página novamente. Após conflito, alvo ausente ou falha de rede, limpar a lista e exigir nova consulta antes de outra alteração: a API pode ter confirmado a mudança antes da falha. 401 expira a fronteira da conta. 403 remove dados e controles administrativos até nova seleção/contexto; não reaproveitar papel de contexto anterior. Mensagens estáticas sem corpo de erro upstream.

Componente administrativo é desmontado em troca/limpeza da seleção, atualização, foco/visibilidade, logout ou mudança de sessão. AbortController cancela transporte e respostas antigas são ignoradas inclusive durante leitura JSON. Formulários associados a labels, lista semântica, status/alert e foco de confirmação/cancelamento; layout responsivo com tokens existentes, sem biblioteca nova.

## Aceite e execução

Documentar e commitar escopo/AGENTS antes do código. Red/Green RTL por comportamento: loading, vazio, paginação, contrato malformado, concessão UUID/papel/CSRF, PATCH, confirmação DELETE, 401/403, conflitos e erros ambíguos, cancelamento/respostas antigas e acessibilidade com axe. Testar composição para administrador e ausência para viewer. Estender jornada real Keycloak/Chrome para usar controles visíveis; testes HTTP existentes permanecem regressões complementares.

Validar lint, tipos, cobertura sem reduzir metas, build, formato, documentos e jornadas aplicáveis. Conferir CI, GitGuardian e revisão efetiva do CodeRabbit. Revisão humana obrigatória; sem merge ou deploy automático.

[Registro de validação](../engineering/administrative-membership-ui-validation.md).
