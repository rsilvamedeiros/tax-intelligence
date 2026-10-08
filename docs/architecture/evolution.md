# Evolução arquitetural

| Estágio             | Gatilho verificável                                                       | Mudança e condição de retorno                                                                                                         |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1: monólito modular | Estado inicial                                                            | Uma API com limites por contexto; remover abstrações sem consumidor                                                                   |
| 2: workers          | Trabalho p95 excede timeout ou exige retry durável                        | Worker e fila com idempotência, backpressure, DLQ e observabilidade; manter processamento síncrono se custo operacional superar ganho |
| 3: serviço extraído | Contexto com owner, contrato estável e gargalo de escala ou deploy medido | RFC, SLO, dados próprios e migração incremental; plano para reintegrar                                                                |
| 4: microfrontend    | Equipes autônomas bloqueadas por releases por pelo menos dois ciclos      | Avaliar acessibilidade, bundle, autenticação e observabilidade compartilhadas                                                         |

Antes de qualquer distribuição: medir acoplamento, frequência de mudança, custo de infraestrutura, maturidade de on-call e consistência exigida. Kubernetes, service mesh, event sourcing e Module Federation não são parte da fundação.

Apps worker/admin permanecem planejadas. Admin separado só após existir público com permissões e jornadas administrativas distintas que a web não atenda de modo simples. Terraform só será executado após provedor, orçamento, ambiente e autorização definidos.
