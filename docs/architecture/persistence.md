# Persistência e multi-tenancy

PostgreSQL como fonte transacional; Drizzle selecionado para consultas tipadas e SQL explícito ([ADR 0002](../adr/0002-postgresql-drizzle.md)). MongoDB não adotado: documentos brutos podem iniciar em JSONB quando houver necessidade aprovada. Redis/BullMQ dependem de cache medido ou trabalhos que excedam o orçamento de uma requisição.

Migration inicial proposta cria apenas schema `platform` e journal técnico do migrador; sem tabelas de negócio. Aplicar migrations por comando separado, nunca implicitamente ao iniciar API. Não editar migrations aplicadas; mudanças aditivas primeiro, backfill controlado e remoção em release posterior. Credencial de migration deve ser distinta da aplicação em produção.

## Modelo proposto da primeira vertical

Organization, User, Membership, FiscalDocument, DiagnosticRun, Finding, AuditEvent. Campos de negócio aguardam confirmação. Todas as linhas pertencentes a cliente recebem `tenant_id NOT NULL`. Unicidades incluem tenant, por exemplo `(tenant_id, idempotency_key)`. Foreign keys compostas impedem referência cruzada, inclusive entre documento e diagnóstico. Índices começam por tenant nos caminhos de leitura medidos.

Isolamento em duas barreiras: associação verificada no servidor e repositórios com escopo obrigatório; RLS PostgreSQL como defesa adicional proposta ([ADR 0003](../adr/0003-tenant-isolation.md)). Não declarar RLS implementado. Pool deve usar `SET LOCAL` dentro de transação, sem contexto persistente entre conexões; role de aplicação não pode ser superuser, dona das tabelas ou BYPASSRLS. Testar conexões reutilizadas e tentativas diretas com role de aplicação.

Escrita do documento, diagnóstico demonstrativo e auditoria na mesma transação no MVP síncrono. Eventos em memória não garantem entrega; outbox só quando processamento separado exigir durabilidade. Nunca publicar efeito externo antes do commit. Dinheiro usa precisão exata; datas normativas e horários de eventos têm semânticas distintas.

Seeds não incluem pessoas, salários ou dados fiscais reais. Nesta etapa sem entidades, não há seed útil a executar; fixtures operacionais são sintéticas. Na vertical, seed exclusivo para banco de desenvolvimento/teste, determinístico e com trava contra produção.

Testes de integração exigem `TEST_DATABASE_URL` isolado. Não usar fallback para DATABASE_URL. CI provisionará PostgreSQL descartável; sem banco disponível, registrar bloqueio e não converter integração em teste mockado.
