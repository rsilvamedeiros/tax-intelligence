# Contribuição

Leia [AGENTS](AGENTS.md), [workflow](docs/engineering/workflow.md) e [setup](docs/engineering/setup.md). Delimite contexto/aceite antes de abrir branch curta. Documente contratos e decisões antes de implementação; TDD por comportamento, com falha esperada demonstrada.

Commits por módulo, uma linha em inglês e Conventional Commits, sem description/body e sem assinatura de agente. Preserve identidade Git real. PR usa o template, evidências de comandos e riscos. Aprovação humana para acesso, isolamento, regra fiscal, dados pessoais e alterações destrutivas. Nunca faça merge automaticamente com base apenas em IA.

Para documentação: `node scripts/validate-docs.mjs` e formatação Markdown. Para código, executar checks aplicáveis de AGENTS, incluindo integração real quando houver persistência. Falhas devem ser reportadas; não substituir testes por afirmações. A fase de negócio só pode começar após autorização explícita.
