# Produto, mercado e hipóteses

Nome técnico: Tax Intelligence Platform. Marca comercial pendente. Camada B2B de inteligência sobre ERPs, sistemas fiscais, contábeis, folha e SST. Não assume responsabilidade de escrituração ou transmissão no MVP.

**Direção definida pelo pedido:** uma fundação compartilhada para Tax-first, Enterprise Intelligence e Infrastructure-first. Tax-first prioriza diagnóstico explicável; Enterprise expande correlações entre domínios; Infrastructure oferece contratos e conectores reutilizáveis. Monorepo e modelo coerente evitam três produtos isolados.

**Hipótese de mercado, ainda sem entrevistas:** conciliação manual entre fontes e mudanças de leiaute geram retrabalho, baixa rastreabilidade e risco de conclusões baseadas em dados incompletos. Validar com cinco entrevistas e dois conjuntos sintéticos representativos antes de ampliar escopo.

## Público e personas propostas

| Persona                                  | Problema                               | Jornada e evidência esperada                                                  |
| ---------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Analista fiscal em empresa ou escritório | Investigar divergência e provar origem | Importar fonte autorizada, ver validação, abrir evidência e registrar parecer |
| Gestor financeiro                        | Priorizar impacto sem perder confiança | Ver diagnóstico revisado e impacto demonstrável, com limitações               |
| Administrador da organização             | Controlar quem acessa dados            | Gerir associação e papel; verificar revogação e auditoria                     |
| Parceiro integrador                      | Reprocessar sem duplicar               | Consultar contrato, enviar com chave idempotente e acompanhar status          |

Proposta de valor a validar: reduzir tempo de diagnóstico com evidência reproduzível, preservar segregação entre clientes e mostrar incertezas. Não prometer economia tributária, recuperação automática ou conformidade integral.

## MVP e requisitos

MVP proposto: uma organização, usuário autenticado, documento JSON sintético, validação estrutural, persistência transacional, uma regra demonstrativa determinística sem efeito tributário, achado com evidências, auditoria e leitura no frontend. [Vertical detalhada](../roadmap/first-vertical.md).

| ID    | Requisito funcional proposto             | Aceite                                                              |
| ----- | ---------------------------------------- | ------------------------------------------------------------------- |
| RF-01 | Associação usuário-organização com papel | Identidade não autenticada: 401; associação ausente: acesso negado  |
| RF-02 | Importação sintética validada            | Campos desconhecidos e valores inválidos rejeitados antes de gravar |
| RF-03 | Deduplicação                             | Mesma chave e payload retornam mesmo resultado; conflito: 409       |
| RF-04 | Diagnóstico explicável                   | Regra, versão, entradas e evidências associadas ao achado           |
| RF-05 | Auditoria                                | Escrita de negócio e evento de auditoria na mesma transação         |
| RF-06 | Consulta segregada                       | Tenant B não consegue consultar documento de tenant A               |

Fora do MVP: transmissão governamental, documentos reais, folha real, recomendações fiscais autônomas, LLMs em decisões críticas, workers, admin separado e marketplace de conectores.

## NFRs propostos, sujeitos a medição

API: p95 de leitura menor que 500 ms em 20 requisições/s sobre fixture e hardware documentados. Disponibilidade alvo futura 99,5% mensal, excluindo manutenção acordada; não existe SLO medido agora. Limite inicial de JSON sintético proposto: 1 MiB; lotes até 100 documentos, condicionado a teste de carga. WCAG 2.2 AA como alvo da interface; axe é verificação parcial. Zero acesso cruzado entre tenants e zero dados sensíveis em logs são critérios bloqueantes. Backup: RPO 24 h/RTO 4 h como proposta para piloto, com teste de restauração antes de uso real.

## Métricas e riscos

Hipóteses de sucesso do piloto: reduzir em 30% o tempo mediano de revisão versus processo manual medido; 100% dos achados reproduzíveis; acompanhar taxa de falsos positivos após revisão humana, sem meta artificial antes do baseline. Medir ativação por primeiro diagnóstico concluído e tempo até evidência aceita.

Riscos: acesso às fontes, representatividade das fixtures, interpretação normativa, variação municipal e confiança indevida em IA. Mitigar com [matriz de integrações](../integrations/feasibility.md), revisão humana e catálogo versionado de regras.
