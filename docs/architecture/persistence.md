# Persistência e multi-tenancy

PostgreSQL como fonte transacional; Drizzle selecionado para consultas tipadas e SQL explícito ([ADR 0002](../adr/0002-postgresql-drizzle.md)). MongoDB não adotado: documentos brutos podem iniciar em JSONB quando houver necessidade aprovada. Redis/BullMQ dependem de cache medido ou trabalhos que excedam o orçamento de uma requisição.

Migration 0000 cria schema `platform` e journal técnico; 0001 cria sessões técnicas BFF; 0002 adiciona atores, organizações e memberships conforme [ADR 0008](../adr/0008-membership-directory.md). Não há tabelas fiscais ou policies RLS. Aplicar migrations por comando separado, nunca implicitamente ao iniciar API. Não editar migrations aplicadas; mudanças aditivas primeiro, backfill controlado e remoção em release posterior. Credencial de migration deve ser distinta da aplicação em produção.

## Modelo proposto da primeira vertical

Organization, User, Membership, FiscalDocument, DiagnosticRun, Finding, AuditEvent. Campos de negócio aguardam confirmação. Todas as linhas pertencentes a cliente recebem `tenant_id NOT NULL`. Unicidades incluem tenant, por exemplo `(tenant_id, idempotency_key)`. Foreign keys compostas impedem referência cruzada, inclusive entre documento e diagnóstico. Índices começam por tenant nos caminhos de leitura medidos.

Isolamento em duas barreiras: associação verificada no servidor e repositórios com escopo obrigatório; RLS PostgreSQL como defesa adicional proposta ([ADR 0003](../adr/0003-tenant-isolation.md)). Não declarar RLS implementado. Pool deve usar `SET LOCAL` dentro de transação, sem contexto persistente entre conexões; role de aplicação não pode ser superuser, dona das tabelas ou BYPASSRLS. Testar conexões reutilizadas e tentativas diretas com role de aplicação.

Escrita do documento, diagnóstico demonstrativo e auditoria na mesma transação no MVP síncrono. Eventos em memória não garantem entrega; outbox só quando processamento separado exigir durabilidade. Nunca publicar efeito externo antes do commit. Dinheiro usa precisão exata; datas normativas e horários de eventos têm semânticas distintas.

Seeds não incluem pessoas, salários ou dados fiscais reais. Fixtures de memberships são geradas e removidas somente no banco isolado de testes; não há provisionamento automático por login nem endpoint público de grants. Na vertical, seed exclusivo para banco de desenvolvimento/teste, determinístico e com trava contra produção.

Runtime desta consulta usa USAGE nos schemas identity_access/organization_access e SELECT em actors/organizations/memberships. Sem ownership, superuser, BYPASSRLS ou escrita; BFF usa credencial distinta para auth_bff. Os adapters parametrizados filtram actor_id. SQL arbitrário com a credencial de leitura pode consultar outras linhas: esta etapa não prova isolamento RLS.

Revogação administrativa acrescenta migration 0003 e adapter transacional conforme [ADR 0010](../adr/0010-membership-revocation.md). Sua role API recebe UPDATE somente em revoked_at e INSERT somente em membership_revocations, além das leituras existentes. Sem escrita de role/identidade, DELETE de vínculos ou leitura/mutação de auditoria. Advisory lock por organização canônica precede locks nos vínculos; autorização, último administrador, update e evento usam a mesma conexão. FKs compostas da auditoria impedem referências de atores pertencentes a outra organização. Isso é controle de acesso da aplicação e privilégio mínimo, não RLS ou proteção contra SQL arbitrário comprometido.

Testes de integração exigem `TEST_DATABASE_URL` isolado. Não usar fallback para DATABASE_URL. CI provisionará PostgreSQL descartável; sem banco disponível, registrar bloqueio e não converter integração em teste mockado.

Migration 0004 cria membership_role_changes com papéis anterior/novo diferentes e FKs compostas de organização/atores. Conforme [ADR 0011](../adr/0011-membership-role-changes.md), mudança de papel e revogação compartilham o helper transacional privado, advisory lock canônico e verificação do último administrador. Runtime recebe UPDATE(role)/INSERT de eventos adicionais, sem criação de vínculos ou leitura/mutação de auditoria. Políticas de RLS permanecem pendentes.
