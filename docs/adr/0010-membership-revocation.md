# ADR 0010 — Revogação administrativa de membership

Status: etapa de desenvolvimento autorizada pelo mantenedor após integração do PR #10. Escopo: API e persistência de controle de acesso; sem deploy, dados reais, administração no navegador, concessão de vínculos ou importação fiscal.

## Contrato e invariantes

DELETE /v1/organizations/:organizationId/memberships/:actorId revoga uma associação existente. Ambos os seletores são UUIDs; query e corpo devem estar vazios. Autenticação Bearer antecede validação dos seletores. O iniciador deriva exclusivamente de issuer/subject verificados, nunca de payload, header de tenant ou role no token. Somente organization_admin ativo na organização pode executar. Ator desconhecido, associação administrativa ausente/revogada, viewer e organização alheia/inexistente recebem o mesmo 403.

Sucesso retorna 204 sem corpo e no-store. Para administrador autorizado, alvo ausente ou já revogado também retorna 204, sem novo evento: repetição é idempotente e não enumera associações. Não permitir revogar o último administrador ativo: 409 sem efeito. Autorrevogação é permitida quando existe outro administrador ativo. Falha de banco, lock, timeout ou auditoria retorna 503 sanitizado. Erros usam o contrato correlacionado existente; OpenAPI documenta 400/401/403/409/503. Nenhuma rota BFF de mutação é criada, portanto tokens continuam exclusivamente no servidor e nenhuma proteção CSRF existente é alterada.

## Transação e auditoria

Organizations and Tenancy possui a revogação e seu evento. Uma conexão/transação READ COMMITTED obtém advisory lock transacional por UUID canônico da organização, depois locks de linha no vínculo iniciador e alvo. Verifica novamente permissão e último administrador dentro da transação. UPDATE revoked_at e INSERT de auditoria devem confirmar juntos. Erro aborta tudo e libera conexão/locks; o pool deve continuar utilizável. Serializar alterações administrativas da mesma organização evita revogações concorrentes removerem todos os administradores. Futuras concessões/trocas de papel devem seguir o mesmo protocolo; operador privilegiado não é protegido contra SQL arbitrário e deve respeitá-lo.

Advisory lock usa hash do UUID convertido pelo PostgreSQL para texto canônico. Colisão somente serializa organizações adicionais; não concede acesso. Evita conceder UPDATE em organizations apenas para bloquear sua linha. Locks transacionais e locks de membership são baseados na [documentação PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html). Leituras atuais do diretório permanecem sob snapshot; este módulo não promete bloqueio retroativo de leitura iniciada ou proteção de futuras ações de negócio.

Migration aditiva 0003 cria membership_revocations com eventId UUID, organizationId, initiatingActorId, targetActorId, papel anterior, instante UTC e requestId UUID. FKs compostas vinculam ambos os atores à organização; sem token, identidade externa, nome/email ou conteúdo fiscal. Runtime recebe somente INSERT na auditoria e UPDATE(revoked_at) nos vínculos, além da leitura existente. Sem UPDATE/DELETE/TRUNCATE de auditoria, criação de atores/organizações/vínculos ou mudança de role. Append-only por privilégios não garante imutabilidade contra proprietário/superuser. Sem API de leitura da auditoria e sem RLS nesta etapa.

## Aceite e TDD

Documentar antes de código. Observar Red comportamental em serviço/HTTP e PostgreSQL real: administrador autorizado, viewer/tenant alheio/revogado, alvo inexistente/repetição, último administrador, auto revogação com outro admin, evento associado a requestId, rollback por falha de auditoria, privilégio mínimo, concorrência coordenada por locks e reutilização do pool depois de erro. Não usar sleep como prova de ordenação.

Integração com API compilada e RSA efêmero deve provar a revogação com token ainda válido, auditoria e respostas/logs sem dados sensíveis. Cobertura e regressões preservadas. Rollback de aplicação desabilita DELETE; preservar migration e auditoria. Revisão humana de segurança antes de produção. RLS e operação fiscal continuam etapas próprias. [Evidências](../engineering/membership-revocation-validation.md).
