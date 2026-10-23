# ADR 0028 — Prova OTLP do diagnóstico sintético

Data: 23/10/2026. Status: próxima etapa solicitada, dependente da interface da PR #32, aberta no início. Sem merge, deploy, dados reais ou configuração de collector externo.

## Decisão e limites

Reutilizar o teste compilado API/RSA/PostgreSQL do diagnóstico com collector HTTP JSON local efêmero. Exportação continua opt-in. Manter atributos de span limitados a rota resolvida e status; adicionar ao log HTTP somente traceId válido gerado pelo SDK para correlacionar log, request ID validado e span efetivamente recebido. Sem traceId inválido quando o SDK estiver desligado. IDs de correlação não viram labels de métricas.

Não adicionar spans de domínio, payload, identidade, tenant, lote ou execução. Não propagar contexto recebido do navegador nem afirmar tracing distribuído web/API. Nenhum novo pacote, grant ou schema. A jornada de navegador do ADR 0027 permanece evidência separada.

## Plano, riscos e aceite

Documentação antes do código. Red HTTP para correlação ausente; Green mínimo; regressão sem SDK. Prova real deve decodificar JSON OTLP, relacionar cada requisição conhecida pelo request ID ao traceId e a exatamente um span, conferir rota template/status, status de erro para 503, ausência de eventos/links e whitelist de atributos/logs. Cobrir criação 201, replay 200, leitura 200 e negativas 401/403/404/503 já exercitadas na integração. Aguardo de exportação limitado; cleanup encerra processo, collector e fixtures mesmo em falha.

Riscos: sucesso falso por procurar texto no payload, exportação ainda pendente e vazamento por novos campos. Bloquear por ausência de span, campos inesperados ou sentinelas de URL/query/body/headers, referências, identidade e credenciais em logs/OTLP. Identificadores de organização/lote/execução não podem estar em atributos ou logs. Revisar também resource e scope, sem alegar que IDs aleatórios de traces são dados de negócio.

Executar HTTP unitário, integração PostgreSQL real isolada, lint/tipos/testes/cobertura/build/smokes/formato/links/audit e CI. Registrar comandos e limitações reais, autorrevisão e revisão externa separadas. Atualizar matriz de aceite da vertical demonstrativa; aprovação humana, integração das PRs, operação de produção e domínio fiscal real permanecem decisões próprias.
