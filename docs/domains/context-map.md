# Mapa de bounded contexts

Todos são planejados e compartilham a fundação. Vocabulário técnico em inglês; documentação em português.

| Contexto                                              | Responsabilidade                                            | Limite                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| [Identity and Access](identity-access.md)             | Autenticar e verificar permissões, sem interpretar tributos | Não possui documentos nem aceita tenant de payload                  |
| [Organizations and Tenancy](organizations-tenancy.md) | Manter organizações e associação de atores                  | Não centralizar tabelas de domínio neste contexto                   |
| [Tax Intelligence](tax-intelligence.md)               | Executar diagnóstico rastreável e regras versionadas        | Não transmite obrigação nem usa LLM como calculadora                |
| [Fiscal Compliance](fiscal-compliance.md)             | Normalizar fontes fiscais e controlar validação estrutural  | Não decide oportunidade tributária nem cria API oficial fictícia    |
| [Payroll](payroll.md)                                 | Conciliar informações de folha com fontes autorizadas       | Não substitui sistema de processamento de folha                     |
| [eSocial](esocial.md)                                 | Modelar eventos, versões e retornos quando homologado       | Não presumir acesso ou transmissão autorizada                       |
| [Occupational Safety / SST](occupational-safety.md)   | Conciliar evidências ocupacionais com acesso restrito       | Não produzir diagnóstico médico ou prontuário clínico               |
| [Financial Intelligence](financial-intelligence.md)   | Relacionar indicadores financeiros e achados revisados      | Não substituir tesouraria ou escrituração                           |
| [Analytics and AI](analytics-ai.md)                   | Produzir projeções de leitura e explicações com origem      | Não é fonte primária das regras nem contorna autorização            |
| [Integrations](integrations.md)                       | Adaptar fontes externas com limites explícitos              | Não interpretar regra fiscal; nenhum scraping autenticado presumido |
| [Audit and Compliance](audit-compliance.md)           | Registrar ações e evidências sem replicar dados sensíveis   | Não confundir log técnico com prova fiscal imutável                 |

## Relações e contratos

Organizations fornece membership verificada a Identity e aos casos de uso. Integrations é anti-corruption layer dos fornecedores; Fiscal normaliza documentos e Tax consome representação validada. Payroll/SST fornecem eventos validados ao contexto eSocial, que não acessa diretamente suas tabelas. Financial consome resultados revisados; Analytics produz read models sem ser fonte de verdade. Audit recebe ações de application ports na mesma transação local quando aplicável.

Nenhum contexto pode consultar tabela privada de outro. Para consulta composta, usar contrato de application ou read model definido. Domain events representam fatos, não comandos disfarçados; conter referência mínima, sem documento integral ou segredo. Dependências circulares exigem redesenho do fluxo, não barrel export para esconder ciclo.

[Arquitetura](../architecture/overview.md), [integrações](../integrations/feasibility.md), [ADRs](../adr/0001-modular-monolith.md).
