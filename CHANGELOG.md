# Changelog

## Não lançado

- BFF administrativo de memberships com token server-side, Origin/CSRF, payload limitado e respostas sanitizadas; jornada real estendida para operações administrativas.

- Consulta administrativa paginada de membros ativos/revogados, com autorização na mesma instrução SQL e resposta mínima sem identidade externa.

- Concessão administrativa de memberships a atores existentes, com auditoria atômica, idempotência, concorrência serializada e sem reativação.

- Alteração administrativa de papéis de memberships existentes, com auditoria atômica, idempotência e preservação do último administrador.
- Protocolo transacional compartilhado entre mudança de papel e revogação; migration aditiva e concorrência cruzada verificada em PostgreSQL.

- Revogação administrativa de membership na API, com auditoria transacional, idempotência, locks e preservação do último administrador.
- Migration aditiva de eventos de revogação e privilégios limitados a revoked_at/INSERT de auditoria; concessão de vínculos e RLS permanecem pendentes.

- Listagem paginada e seleção de organização no navegador, com vínculo revalidado pela API através do BFF.
- Jornada Keycloak/Chrome com seleção, tentativa cruzada, revogação após listagem e logout; credenciais distintas de API/BFF no banco de testes.

- Login/sessões BFF e verificação de access tokens da API.
- Consulta autenticada de organizações/memberships, sem criação automática de ator ou associação.
- Migration aditiva de identidade/membership e integração HTTP/PostgreSQL com runtime de leitura.

- Documentação de produto, arquitetura, contextos, segurança e roadmap.
- Decisões técnicas registradas em ADRs, com estado de revisão explícito.
- Orientações de TDD, revisão, commits por módulo e PRs.
- AGENTS e 16 skills locais para tarefas de engenharia.

- Monorepo pnpm/Turborepo com Next.js, NestJS 11 e TypeScript strict.
- Health/readiness, erros correlacionados, limite JSON e logs/traces sem payload sensível.
- Migration técnica PostgreSQL/Drizzle e teste real de rollback/idempotência.
- Tela operacional com estados acessíveis, testes RTL/axe e Cypress/Chrome.
- Hooks de qualidade, CI, dependency audit e secret scanning preparados para PR.

Fundação com identidade e consulta de memberships, sem deploy ou vertical fiscal; não constitui release de produção.
