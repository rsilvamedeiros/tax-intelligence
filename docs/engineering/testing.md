# TDD e estratégia de testes

Red → Green → Refactor por comportamento. Red deve falhar pela capacidade ausente, não por import inválido, toolchain quebrada ou teste mal escrito. Registrar teste e motivo da falha antes de implementar a etapa. Não descrever código criado antes dos testes como TDD retroativamente.

## Pirâmide e fronteiras

| Camada       | Teste significativo                                     | Dublês permitidos                       |
| ------------ | ------------------------------------------------------- | --------------------------------------- |
| Domínio      | Entradas de regra, vigência, arredondamento e evidência | Nenhum ORM/Nest                         |
| Aplicação    | Escopo autorizado, idempotência e efeito transacional   | Portas externas, nunca regra sob teste  |
| Persistência | Constraints, RLS, rollback, migrations e concorrência   | PostgreSQL real isolado                 |
| REST         | Contrato, 401/403/404, erro, request ID                 | Serviço em cenários de falha; rota real |
| Componente   | Loading, vazio, erro, sucesso e recuperação             | Transporte da API                       |
| E2E          | Jornada browser → API → banco                           | Apenas terceiros não homologados        |

Fundação: contrato de health, falha real de conexão em endereço local indisponível, headers, erros seguros, logs sem entradas sensíveis, tela operacional e proxy. Integração de banco testa migration idempotente e rollback; não comprova tenant isolation ainda.

Metas iniciais para código testável: 80% linhas, funções e statements; 70% branches. Regras críticas precisam de matriz de casos completa e testes negativos, independentemente da cobertura. Entrypoints e inicialização de telemetria podem ter exclusão documentada e smoke test real. Não reduzir metas ou remover testes para passar pipeline.

`pnpm test` executa unitários, contratos, componentes e HTTP; `pnpm test:integration` exige TEST_DATABASE_URL; `pnpm test:coverage` gera relatório; `pnpm test:e2e` exige apps construídas e browser Cypress. Testcontainers poderá substituir Compose na integração quando houver Docker, sem adicionar neste bootstrap por aparência.

Fixtures sintéticas fixas; controlar tempo e aleatoriedade nas regras. Concorrência e idempotência serão testadas com barreiras e índices reais, não sleep arbitrário. Comando indisponível é bloqueio reportado, nunca teste aprovado. [Registro de validação](validation.md).
