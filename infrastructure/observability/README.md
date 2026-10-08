# Observabilidade mínima e evolução

Preparação: log JSON por requisição, request ID validado, route template resolvido, statusCode e durationMs; erros sem stack/payload. Traces manuais OpenTelemetry opt-in via endpoint OTLP. Atributos permitem apenas rota e status; não capturar URL bruta, query, headers, CPF, dados de saúde, remuneração ou conteúdo fiscal.

Métricas iniciais serão derivadas dos eventos operacionais: p50/p95/p99 de latência e taxa de 5xx por rota. Sem backend de métricas configurado ainda, não afirmar dashboards ativos. Contadores futuros: duração de processamento, falhas por conector, rejeições por motivo limitado, jobs pendentes, diagnósticos concluídos e inconsistências detectadas. Evitar tenant/user/document como label de métricas.

Collector local e Prometheus/Grafana aguardam necessidade e etapa técnica. Definir sampling, retention, acesso, redaction e budget antes de exporter real. Multi-processo web/API deverá propagar W3C Trace Context após teste e revisão; spans presentes não significam tracing distribuído completo.

Liveness mede processo; readiness mede dependências configuradas. Alertas propostos para piloto: 5xx acima de 1% por 10 min com volume mínimo e readiness down por 2 min. Limiares são hipóteses a calibrar, não SLO observado. [NFRs](../../docs/product/strategy.md), [segurança](../../docs/security/security-model.md).
