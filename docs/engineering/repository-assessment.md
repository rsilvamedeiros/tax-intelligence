# Avaliação do repositório e plano

Inspeção em 08/10/2026. Base: `01b61f8` (`Initial commit`), branch `main`. Apenas `README.md` versionado, com título `tax-intelligence`. Working tree inicialmente limpa. Remoto origin: repositório `rsilvamedeiros/tax-intelligence` no GitHub. Não houve reinicialização, commit, push ou alteração remota durante a inspeção.

Ambiente: Windows/PowerShell, Node 20.19.0, pnpm 10.24.0, npm 10.8.2 e Python disponíveis; Docker ausente. Node 24.21.0 foi baixado para `.local`, com hash conferido contra SHASUMS do distribuidor, sem alterar Node global. Node 20 não é runtime suportado para este projeto ([ciclo oficial](https://github.com/nodejs/Release)).

## Sequência e pontos de revisão

| Etapa | Entrega                                         | Aceite para avançar                                               |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------- |
| 0     | Inspeção e riscos                               | Base identificada e trabalho existente preservado                 |
| 1     | Produto, arquitetura, domínios, ADRs, roadmap   | Links válidos; decisões e hipóteses distinguidas; revisão do diff |
| 2     | AGENTS, skills, revisão e TDD                   | Skills válidas; limites de autonomia e critérios explícitos       |
| 3     | Monorepo, apps mínimos e contratos operacionais | Instalação congelada, lint, tipos, testes e build                 |
| 4     | CI, proteção básica e observabilidade           | Checks executados onde possível; bloqueios reportados             |
| 5     | Primeira vertical de negócio                    | **Autorização explícita do responsável pelo produto**             |

Orientação posterior: documentação primeiro, trabalho por etapa e commits separados por módulo. Arquivos de bootstrap foram criados antes dessa orientação e continuam sem validação concluída; não fazem parte do aceite documental. Não apresentar esses arquivos como entrega funcional comprovada.

## Riscos reais

- Docker ausente impede executar o ambiente PostgreSQL em Compose; usar banco de teste isolado ou instalar Docker antes da integração.
- Instalação inicial depende de acesso ao npm e download do Cypress; congelar lockfile apenas depois de resolver compatibilidade.
- ESLint 9 retornou aviso de fim de suporte: reavaliar versão com os plugins antes de aprovar bootstrap.
- Proteções de branch, credenciais de reviewer e configuração de hosting ainda não verificadas.
- Domínio fiscal e integrações governamentais precisam de validação especializada; documentação não constitui homologação.

Evidências de cada etapa devem ser registradas em [validação](validation.md).
