# Status do projeto

Atualizado em 19/10/2026. Fundação técnica em desenvolvimento; sem deploy de produção e sem primeira vertical fiscal implementada. Estados abaixo distinguem recurso entregue de prova isolada e proposta.

| Área                                             | Estado concreto                                            | Evidência / próximo passo                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Monorepo, API/web, CI e observabilidade          | Implementados                                              | [Bootstrap](bootstrap-validation.md); checks por PR                                                                |
| Login OIDC, token na API e sessão BFF            | Implementados em desenvolvimento                           | [Autenticação](authentication-validation.md), [BFF](bff-session-validation.md); operação/IdP de produção pendentes |
| Organizações, seleção e administração de membros | Implementados, incluindo interface e correção da jornada   | [Interface](administrative-membership-ui-validation.md), [integração/correção](rls-proposal-validation.md)         |
| Prova de RLS com dados sintéticos                | 12 cenários aprovados localmente e no CI; revisão pendente | [ADR 0016](../adr/0016-synthetic-rls-proof.md), [validação](synthetic-rls-validation.md)                           |
| Isolamento RLS de dados reais de domínio         | Pendente de contexto/tabela autorizados e etapa própria    | Prova sintética não equivale a proteção da aplicação                                                               |
| Importação e diagnóstico demonstrativo           | Não implementados; aguardam autorização da vertical        | [Primeira vertical](../roadmap/first-vertical.md)                                                                  |
| Regras tributárias/conectores reais              | Não implementados                                          | Fonte oficial, vigência, credencial/autorização e revisão especializada antes de modelar                           |
| Piloto e produção                                | Pendentes                                                  | Hospedagem, operação, retenção, responsáveis e aceite de segurança                                                 |

Resultado local desta etapa: evidência reproduzível de policies, privilégios e contexto por transação em PostgreSQL isolado. Depois, definir o próximo recorte autorizado para aplicar os controles a um consumidor real; não antecipar importação fiscal por uma prova de infraestrutura.
