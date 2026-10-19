# ADR 0016 — Prova RLS em fixtures PostgreSQL

Status: decisão da etapa técnica autorizada pelo pedido de próxima entrega após integração da PR #18. Prova implementada e validada localmente; CI/revisão pendentes. Aceita o recorte da [RFC 0002](../rfc/0002-synthetic-rls-proof.md), sem habilitar RLS em tabelas da aplicação ou autorizar domínio fiscal.

## Execução

Implementar a [matriz de 12 cenários](../engineering/synthetic-rls-test-plan.md) exclusivamente em teste de integração PostgreSQL. Fixture e helpers privados ficam no arquivo spec, excluído do build; nenhum helper público ou abstração de runtime. Owner provisiona schema e login exclusivos; assertions usam conexão autenticada restrita com pool de tamanho 1. Schema contém somente registros, referências e eventos técnicos sintéticos, sem migration de produto.

Antes da prova, verificar identidade/atributos de role, ausência de associação ao owner, grants e ownership. Após ativação, verificar ENABLE/FORCE e policies por comando/role. Red inicial precisa mostrar leitura cruzada sem RLS; Red de escrita exige grant correto e falha pela policy ausente. Integridade composta e evento atômico são demonstrados apenas na fixture.

Contexto parametrizado local à transação, leitura de linhas e PID real verificam reutilização após commit/rollback/erro. Helper privado de teste rejeita conexão contaminada por setting de sessão e descarta conexão cujo rollback falha. Teste de falha usa exclusivamente backend pertencente à fixture; nunca encerrar conexão externa. Cleanup fecha pools, revoga grants exclusivos e remove apenas objetos/roles criados pela própria execução, inclusive após falha parcial de setup.

Policy baseada em setting mutável demonstra filtragem sob contexto escolhido, não autenticação ou proteção contra SQL arbitrário comprometido. Um cenário registra deliberadamente que mudar o setting pode admitir outro tenant. Lookup de identidade/membership e seus locks seguem os adapters atuais; DB-03 e isolamento real de domínio continuam pendentes.

## Aceite e verificação

Todos os cenários aprovados com runtime sem privilégios excessivos, SQLSTATE/linhas/PID observados e nenhuma fixture restante. Executar integração completa existente, lint, tipos e build aplicáveis, formato/documentação e checks remotos. Registrar versão local e de CI efetivamente executadas, Red/Green observado e regressões acrescentadas após implementação. Nenhum teste mockado substitui PostgreSQL real; não reduzir thresholds ou ampliar timeouts para ocultar falhas.

[Validação](../engineering/synthetic-rls-validation.md) e [status do projeto](../engineering/project-status.md). Revisão humana necessária antes de merge; sem deploy automático.
