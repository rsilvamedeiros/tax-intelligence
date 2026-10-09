# Threat model — identidade e isolamento

Status: proposta para a vertical com controles parciais implementados: access tokens da API, sessões BFF e consulta de memberships. A consulta usa ator verificado, filtro explícito e runtime de leitura, com revogação observada na próxima requisição após commit; não há administração, locks para efeitos ou RLS. [Validação de memberships](../engineering/membership-validation.md). Escopo futuro: [RFC 0001](../rfc/0001-identity-membership-isolation.md); evidências exigidas na [matriz de testes](../engineering/identity-tenancy-test-plan.md).

Seleção no BFF/UI foi implementada no ADR 0009: token permanece server-side, URLs upstream são fixas e respostas são validadas; acesso negado após revogação não cria contexto selecionado. Atualizar/foco, troca de sessão e logout limpam dados e cancelam respostas antigas. A seleção visual não mantém grant nem substitui autorização futura de ação. [Evidências da jornada](../engineering/browser-organization-validation.md).

Ativos: sessão, tokens, membership, documentos sintéticos e auditoria. Adversário considerado: usuário sem sessão, membro de outra organização, usuário revogado e cliente que altera headers/payloads. Administrador de infraestrutura e comprometimento do IdP exigem resposta operacional própria; RLS não protege contra superuser.

| Fronteira/ameaça                                                  | Controle proposto                                                                          | Evidência exigida |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Browser → callback: login CSRF, replay e redirect aberto          | PKCE S256, state/nonce vinculados, callback único e destinos restritos                     | AUTH-02/03        |
| Browser → BFF: roubo de sessão e CSRF                             | Cookie opaco protegido, sessão server-side expirada/revogável, proteção de mutações        | AUTH-04/05        |
| BFF → API: ID token ou token de outro cliente                     | Verificação de issuer/audience/assinatura/validade; rejeição de ID token como access token | AUTH-01/06        |
| API → IdP: JWKS controlado pelo atacante                          | Endpoints confiáveis configurados, timeout, falha fechada e rotação controlada             | AUTH-07           |
| Seleção de organização: tenant forjado ou claim de role           | Membership e permissões locais verificadas em cada caso de uso                             | ACCESS-01/02      |
| Revogação: sessão válida após perda de acesso                     | Membership sem cache, locks e revogação transacional                                       | ACCESS-03/04      |
| API → banco: omissão de filtro, alteração de tenant ou FK cruzada | Filtro explícito, constraints compostas e policies de leitura/escrita                      | DB-01/02/03       |
| Pool: contexto residual de tenant                                 | Contexto local à transação; role restrita; acesso sem contexto negado                      | DB-04/05          |
| Auditoria: efeito de negócio sem evento ou com actor forjado      | Actor verificado e escrita atômica; sem conteúdo de documento                              | DB-06             |
| Logs/traces/respostas: tokens, cookie, SQL ou enumeração          | Campos permitidos e erros sanitizados; 404 para recurso de outro tenant                    | PRIVACY-01/02     |

Limites: autorização local não detecta instantaneamente conta revogada no IdP; SLA depende do provedor e ciclo dos tokens. Operação autorizada antes de revogação pode concluir conforme locks definidos na RFC. Cada limite precisa de aceite humano antes da implementação.

Critérios bloqueantes: acesso cruzado, credencial exposta, callback reutilizável, permissão derivada de entrada não confiável, escrita parcial ou role runtime capaz de ignorar RLS. Mitigação só pode ser marcada implementada após teste executado. Ausência de falhas no scanner não comprova ausência de todas as exposições.
