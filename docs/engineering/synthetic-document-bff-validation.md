# Validação do BFF do lote sintético

Data: 20/10/2026. Escopo do [ADR 0020](../adr/0020-synthetic-document-bff.md), após integração da PR #23. Rotas POST/GET do lote passam pela sessão técnica existente e pela API; nenhum novo acesso SQL da web.

## TDD e comportamento

Três ciclos observados:

1. POST ainda indisponível retornou 503 quando esperado 201. Green: encaminhamento normalizado com token server-side e chave validada; um teste aprovado.
2. GET ainda indisponível retornou 503 quando esperado 200. Green: detalhe estrito, sem exigir CSRF para leitura; dois testes aprovados.
3. Duas formas de charset com aspas incompletas retornaram 201 quando esperado 415; 72 regressões passaram. Green: aceitar somente UTF-8 com aspas balanceadas ou sem aspas; 74 testes aprovados.

Os demais testes são regressões acrescentadas durante a entrega. Ajustes de tipos e do harness não são Red: Headers normaliza espaços externos, portanto a chave inválida é testada com espaço interno preservado pelo transporte.

74 casos com Request/Response/streams reais: origem/host/método, sessão e falhas do storage, CSRF, seletores/query vazia, chave ausente/duplicada/inválida/maiúscula, schema estrito, mídia/compressão/UTF-8, limite exato e excesso de bytes sem confiar no Content-Length, cancelamento de stream, GET sem corpo, replay, negações e falhas upstream sanitizadas. Resposta também limitada a 16 KiB e validada; cookies/headers/erros privados não são repassados. Timeout de 3s e redirect proibido permanecem no transporte do runtime. Não há retry automático.

## Execução local

Node 24.21.0, pnpm 10.24.0 e PostgreSQL 18.1 isolado. Nenhuma credencial real ou dado de cliente utilizado.

- `pnpm test:coverage`: 547 testes combinados aprovados, incluindo 163 de servidor BFF; thresholds globais preservados.
- `pnpm test:integration`: 108 testes PostgreSQL aprovados, em nove suítes.
- `pnpm test:integration:synthetic-batch` e `pnpm test:integration:membership`: regressões compiladas RSA/PostgreSQL aprovadas.
- Ensaio local das fixtures de navegador: três logins distintos, perfil do pool do lote aprovado pelo validador real; cleanup executado.
- `pnpm build`: rotas Next de coleção POST e detalhe GET registradas no build.
- `pnpm lint`, `pnpm typecheck` incluindo Cypress e `pnpm test:smoke`: aprovados; smokes RSA e OTLP gerais sem sentinelas sensíveis.
- `node scripts/validate-docs.mjs`: 100 documentos Markdown e 16 manifests de skills validados. Formato verificado antes dos commits.
- `pnpm audit:dependencies`: exit 0, um advisory moderado já existente; nenhum alto/crítico reportado, sem dependências novas nesta entrega.

Jornada Keycloak/Chrome não foi executada localmente nesta etapa. No [CI 39496339933](https://github.com/rsilvamedeiros/tax-intelligence/actions/runs/39496339933), head `7bec8f3`, o job identity-provider executou Chrome 155 headless: uma jornada aprovada, zero falhas. Inclui sessão/cookies reais, CSRF, criação/replay/conflito, consulta, tenant externo, leitura após rebaixamento e negação de nova criação, além de 401 depois do logout. API administrativa, BFF e lote usam roles distintas; cleanup inclui somente lotes/eventos de organizações da fixture. PostgreSQL 17.11 aprovou as nove suítes/108 testes no job de banco. Os sete jobs e GitGuardian passaram. Nenhum grant de produção ou migration nova.

## Revisão e limites

Autorrevisão local cobre transporte, autorização na API, imports e segredo/sanitização. [CodeRabbit 5591706916](https://github.com/rsilvamedeiros/tax-intelligence/pull/24#pullrequestreview-5591706916) revisou os 20 arquivos no head `7bec8f3`; apontou somente uma inconsistência documental no plano de testes, corrigida após conferir a execução de navegador. Nenhum achado de código. O ajuste posterior é documental e não equivale a nova revisão independente do head final. Aprovação humana continua obrigatória para a fronteira de sessão/CSRF.

O BFF não mantém autorização em cache nem concede acesso por organização selecionada. Falha depois do commit pode ter efeito: conservar comando/chave em eventual repetição; a futura UI precisa tratar esse estado. Readiness agregada do pool do lote e operação de produção continuam pendentes do ADR 0019. Prova OTLP específica das novas rotas ainda não executada; smokes gerais não a substituem. Próxima etapa sugerida: interface de criação/consulta com limpeza de estado por sessão/organização, sem diagnóstico ou dado fiscal real.
