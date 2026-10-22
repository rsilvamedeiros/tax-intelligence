# Validação dos contratos e casos de uso da execução sintética

Etapa do [ADR 0023](../adr/0023-synthetic-diagnostic-use-cases.md), em 22/10/2026. A PR #27 da RFC estava aberta no início desta entrega; branch dependente, sem merge automático. O pedido de próximo módulo autorizou este recorte de contratos/application; decisões de SQL/grants da RFC continuam pendentes de etapa própria.

## TDD observado

Quatro ciclos Red/Green: recibo vazio aceito pelo schema provisório, corrigido com contrato fechado; criação indisponível no caso de uso, corrigida com núcleo real e capacidades transacionais; replay devolvia created e repetia gravação, corrigido com lookup natural e retorno sem inserção/evento. Na autorrevisão, um quarto teste demonstrou que mutação do objeto recebido pelo adapter podia alterar a referência usada na comparação; Red observado e Green após enviar cópia por structuredClone, preservando o cálculo original. Um patch intermediário teve erro de sintaxe, corrigido antes do Green; essa falha não conta como Red. Regressões adicionais não são alegadas como novos ciclos Red.

Contrato testa comandos por referência sem identidade/ator/documentos/versão do cliente, IDs normalizados, UTC canônico, recibo/detalhe estritos e obrigatoriedade/limites dos artefatos OpenAPI. Application usa dublês apenas nas portas: núcleo e schemas são reais. Testa negação sem consulta, scope incompatível, snapshot incompleto ou com id errado, evidência adulterada e ordem, replay entre atores verificados pela porta, ausência, falhas de gravação/evento/conclusão e leitura independente de escrita.

## Evidências e limites

- `pnpm test:coverage`: aprovado no código final, 760 testes (154 contracts, 321 API, 122 web/componentes e 163 BFF). 92 novos: 36 de contrato e 56 de application. Ambos os arquivos executáveis novos com 100% nos indicadores, sem redução de limites.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` e `pnpm test:smoke`: aprovados novamente após corrigir a mutação. Smokes verificaram RSA e exportação OTLP real sem sentinelas sensíveis.
- `pnpm audit:dependencies`: exit 0; um advisory moderado existente, sem dependência adicionada.

Nenhum adapter de banco, migration, grant, configuração de conexão, módulo Nest, endpoint ou UI foi adicionado. Testes de persistência e browser não foram executados localmente para simular capacidade ausente; CI preserva as regressões existentes. Formato, links e diff são conferidos antes do commit; CI/revisão externa ainda pendentes.

A unidade de trabalho é contrato de autorização/lock/contexto/commit, não uma implementação desses controles. Falha simulada de conclusão comprova propagação do erro em application; não comprova rollback PostgreSQL, disputa de locks ou isolamento RLS. RUN-02–16 da matriz mantêm os aceites de persistência pendentes. Consulta recalcula evidência pelo snapshot para detectar inconsistência, preservando ordem e comparação estrutural após schemas.

Autorrevisão local de contrato, imports, fronteiras e falhas; revisão externa e aceite humano são evidências distintas. Próximo módulo deve implementar adapter real com conexão compartilhada, snapshot público Fiscal, auditoria e RLS/grants, sob testes PostgreSQL isolados antes de qualquer exposição HTTP. Primeira vertical continua incompleta e comparação permanece sem validade fiscal.
