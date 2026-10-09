# CI/CD, dependências e releases

## CI proposto por etapa

Primeiro PR documental: validação de links e manifestos de skills, revisão de coerência e diff. Workflow [Documentation](../../.github/workflows/documentation.yml) implementado com job `documentation`, Node 24, actions fixadas por SHA e permissões de leitura; executa o validador sem instalar dependências do bootstrap. Execução remota só pode ser declarada após verificar o resultado do Actions.

Workflow [Continuous Integration](../../.github/workflows/ci.yml) implementado para PR e main: checkout, pnpm fixado, Node 24, install frozen, formato, lint, tipos, unitários/HTTP/componentes, cobertura, build, smoke OTLP, audit e secret scanning. Job separado com PostgreSQL 17 descartável para migrations/integração; Cypress/Chrome sobre build real em outro job. Artefatos de cobertura e screenshots de falha têm retenção de sete dias. Sem configurar deployment nesta fase.

Job database-integration também constrói a API e executa `pnpm test:integration:membership`: RSA/JWKS efêmeros, processo compilado e conexão PostgreSQL distinta do migrador. A primeira fase usa role de leitura e verifica seleção cruzada, revogação após commit e indisponibilidade sanitizada. A fase administrativa abaixo acrescenta somente os privilégios de revogação. Não demonstra RLS ou a jornada completa com ação fiscal.

ADR 0010 estende esse runner: depois da fase de leitura, concede somente UPDATE(revoked_at)/INSERT de auditoria e testa DELETE administrativo, idempotência, último administrador, revogação com token válido e rollback por falta de privilégio de auditoria. Concorrência e locks são demonstrados pelos testes PostgreSQL do job database-integration, observando bloqueios sem usar sleep como prova de ordenação. A jornada identity-provider permanece uma regressão de login/seleção; não há administração no navegador nesta etapa.

ADR 0011 acrescenta uma fase posterior com UPDATE(role)/INSERT de auditoria de papéis: PATCH administrativo, repetição sem evento, promoção, rebaixamento, perda de permissão com token válido e rollback da alteração quando a auditoria falha. Testes PostgreSQL verificam disputa entre rebaixamento e revogação e revalidação do iniciador após esperar o lock compartilhado. Veja [evidências da etapa](membership-role-validation.md).

Cache apenas dependências e artefatos reprodutíveis, nunca segredos. Alterações em .env.example e variáveis runtime devem constar em turbo env para impedir cache incorreto. Dependências novas exigem necessidade concreta, licença, compatibilidade, manutenção e revisão do audit. Lockfile no PR técnico; versões prerelease não são padrão de produção.

Required checks propostos: `documentation`, `quality`, `database-integration`, `e2e`, `dependency-audit`, `secret-scan`, conforme jobs forem implementados. Não exigir checks inexistentes. Branch protection: impedir push direto em main, exigir review humano, dismiss stale reviews e checks atuais. Essas configurações **não foram aplicadas remotamente**.

## Entrega e versionamento

ADR 0014 estende a mesma jornada identity-provider com BFF administrativo, CSRF/origem, concessão idempotente, mudança de papel, revogação e perda de acesso administrativa. Fixture concede à role API apenas os privilégios já definidos nos ADRs 0010–0012; role BFF mantém somente auth_bff. Cleanup remove eventos/vínculos/atores das organizações sintéticas próprias. [Evidências](administrative-membership-bff-validation.md).

ADR 0013 estende a integração da API compilada com consulta administrativa paginada, estado revogado e negação com token ainda válido após rebaixamento/revogação. Reutiliza privilégios de leitura; não cria migration ou configuração de entrega. [Evidências](administrative-membership-directory-validation.md).

Job `identity-provider` inicia Keycloak de desenvolvimento com senhas efêmeras mascaradas, importa realm versionado e confere discovery/PKCE/JWKS. Aplica migrations em PostgreSQL efêmero e executa login, seleção de organização, tentativa cruzada, revogação após listagem e logout pelo navegador real com conta sintética. API e BFF usam roles distintas e restritas; o runner controla somente fixtures próprias. Não demonstra RLS ou efeitos de negócio. `quality` também executa smoke do processo compilado com access token RSA sintético. Conferir esses jobs e checks externos antes de declarar o PR verde.

Versão inicial da fundação: 0.1.0 planejada; SemVer para releases, sem promessa de API estável durante 0.x. Conventional Commits orienta changelog, mas não libera produção automaticamente. Ambiente de staging com dados sintéticos precede produção; release requer runbook, snapshot/backup testado, health/readiness, smoke test, plano de rollback e aprovação humana.

Rollback de app deve manter compatibilidade com schema expandido; rollback destrutivo de migration não é pressuposto. Ensaio de restore comprova backup. CD depende de escolha de provedor, orçamento, segredos, ambientes e autorização. AI reviewer poderá ser integrado via GitHub Actions/serviço após credenciais e política de dados aprovadas; nunca realizar auto-merge baseado apenas em IA.

ADR 0012 acrescenta ao runner da API compilada a fase de concessão, com INSERT limitado às colunas de vínculo e INSERT de auditoria. Verifica acesso negado antes da concessão, acesso após commit, repetição sem evento, papel diferente/revogado como conflito e rollback por falta de permissão na auditoria. Concorrência e permissão perdida durante espera são verificadas em PostgreSQL real. [Evidências](membership-grant-validation.md).
