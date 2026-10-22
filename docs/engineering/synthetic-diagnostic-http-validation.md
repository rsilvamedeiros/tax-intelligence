# Validação da API de diagnóstico sintético

Etapa do [ADR 0025](../adr/0025-synthetic-diagnostic-http.md), em 22/10/2026, dependente da PR #29. POST/GET compõem serviço e persistência existentes; não acrescentam migration, permissão ou interface web.

## TDD e contrato

Dois ciclos observados em ambiente válido: POST retornava 404 em vez do 503 esperado sem storage; após registro de controller/módulo, passou. Composição aceitava login administrativo compartilhado; após validação da URL/login exclusivo, passou. Demais cenários são regressões adicionadas, sem alegar Reds individuais.

33 testes HTTP e nove de composição: identidade antes dos seletores, criação/replay 201/200, leitura estrita, 401/403/404/503, schema fechado, UUIDs/query/Idempotency-Key, mídia/compressão/JSON, limite UTF8 e chunked, GET sem corpo, falhas sanitizadas, no-store/request ID, OpenAPI e pool próprio/shutdown. Dublês substituem verificador/serviço nos testes de transporte e pool no teste de composição; não provam isolamento SQL.

## Evidências locais

- Node 24.21.0, pnpm 10.24.0, PostgreSQL 18.1 isolado com TEST_DATABASE_URL `_test`. Nenhum fallback para .env/DATABASE_URL nos testes de persistência.
- `pnpm exec turbo test:coverage --concurrency=1`: 802 testes de aplicação aprovados (42 novos); limiares mantidos. `pnpm test:integration`: 144 testes/dez suítes aprovados.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` aprovados. Build usa Next.js 16.4.1, correção de segurança publicada separadamente na PR #29.
- `pnpm test:integration:synthetic-diagnostic-http`: API compilada, JWKS/RSA temporários, login PostgreSQL real NOINHERIT/restrito. Criação concorrente/replay com mesmo recibo, soma/diferença exatas, uma auditoria, Bearer ausente/inválido, identidade não provisionada, A/B, viewer/reviewer, negação após revogação e privilégio excessivo com 503/recovery aprovados. Headers tenant e papéis do token não concedem acesso. Logs conferidos contra sentinelas sintéticas/credenciais; isso não equivale a prova OTLP específica.
- Primeira jornada falhou por nome de campo incorreto na asserção (`calculatedTotalCents` em vez de `computedTotalCents`). Corrigida a fixture de teste, jornada passou; falha não alegada como Red de implementação.
- `pnpm test:smoke`: autenticação e exportação OTLP existentes aprovadas. `pnpm audit:dependencies`: código zero, um alerta moderado restante após patch Next.js, sem suprimir alertas.

Formato e links de 112 documentos/16 manifests aprovados; diff sem erros de whitespace. Jornada HTTP compilada repetida após refino final e regressão `pnpm test:integration:synthetic-batch` aprovadas. Cleanup confirmou ausência de roles temporárias, lotes, execuções, eventos e funções de falha; cluster iniciado nesta etapa encerrado. CI desta branch pendente na abertura da PR.

Revisão local é autorrevisão de contratos, privilégios, parser, resposta e ciclo do pool, sem achado bloqueante identificado; revisão externa e aceite humano são separados e obrigatórios para segurança. Não declarar revisão aprovada a partir do status verde do bot sem review produzido. Na PR #29, CodeRabbit revisou 24 arquivos em f2611dd; achado documental corrigido em 321ee14 e resolvido. Patch de segurança Next.js em b76646a, sem suprimir scanners.

## CI e revisão externa

PR #30 em rascunho por depender da #29, sem merge automático. Em a37eb3e, [CI](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39836696803) aprovou qualidade, documentação, auditoria de dependências, E2E, ambos os scanners e integração PostgreSQL 17.11: 144 testes e jornadas compiladas de lote/serviço/API de diagnóstico. Identity-provider estava publicando o resultado após todos os passos, incluindo navegador real, passarem.

CodeRabbit produziu review 5619518200 em a37eb3e, abrangendo 24 arquivos. Dois achados inline e um fora do diff, todos documentais: histórico do ADR 0023, pool opcional no bootstrap e status do diagnóstico HTTP. Correções documentais preparadas e validadas antes da publicação; sem alegar revisão externa do commit posterior ou aprovação humana.

## Limites e decisão seguinte

`SYNTHETIC_DIAGNOSTIC_DATABASE_URL` sem fallback; ausência resulta em 503 nas operações válidas/autenticadas, configuração inválida falha ao iniciar. Perfil é conferido em cada operação pelo store; runtime não provisiona grants nem executa migrations. Sem deployment ou credencial em ambiente do usuário. RLS continua limitado às seis relações sintéticas; controle e dados reais pendentes.

Próximo módulo: BFF de diagnóstico com sessão server-side, Origin/CSRF na criação, limites e schemas estritos, sem SQL na web. Interface, recuperação explícita após efeito incerto e prova OTLP específica continuam posteriores. Primeira vertical ainda não concluída; comparação demonstrativa sem validade fiscal.
