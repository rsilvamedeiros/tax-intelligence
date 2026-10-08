# CI/CD, dependências e releases

## CI proposto por etapa

Primeiro PR documental: validação de links e manifestos de skills, revisão de coerência e diff. Workflow [Documentation](../../.github/workflows/documentation.yml) implementado com job `documentation`, Node 24, actions fixadas por SHA e permissões de leitura; executa o validador sem instalar dependências do bootstrap. Execução remota só pode ser declarada após verificar o resultado do Actions.

Workflow [Continuous Integration](../../.github/workflows/ci.yml) implementado para PR e main: checkout, pnpm fixado, Node 24, install frozen, formato, lint, tipos, unitários/HTTP/componentes, cobertura, build, smoke OTLP, audit e secret scanning. Job separado com PostgreSQL 17 descartável para migrations/integração; Cypress/Chrome sobre build real em outro job. Artefatos de cobertura e screenshots de falha têm retenção de sete dias. Sem configurar deployment nesta fase.

Cache apenas dependências e artefatos reprodutíveis, nunca segredos. Alterações em .env.example e variáveis runtime devem constar em turbo env para impedir cache incorreto. Dependências novas exigem necessidade concreta, licença, compatibilidade, manutenção e revisão do audit. Lockfile no PR técnico; versões prerelease não são padrão de produção.

Required checks propostos: `documentation`, `quality`, `database-integration`, `e2e`, `dependency-audit`, `secret-scan`, conforme jobs forem implementados. Não exigir checks inexistentes. Branch protection: impedir push direto em main, exigir review humano, dismiss stale reviews e checks atuais. Essas configurações **não foram aplicadas remotamente**.

## Entrega e versionamento

Versão inicial da fundação: 0.1.0 planejada; SemVer para releases, sem promessa de API estável durante 0.x. Conventional Commits orienta changelog, mas não libera produção automaticamente. Ambiente de staging com dados sintéticos precede produção; release requer runbook, snapshot/backup testado, health/readiness, smoke test, plano de rollback e aprovação humana.

Rollback de app deve manter compatibilidade com schema expandido; rollback destrutivo de migration não é pressuposto. Ensaio de restore comprova backup. CD depende de escolha de provedor, orçamento, segredos, ambientes e autorização. AI reviewer poderá ser integrado via GitHub Actions/serviço após credenciais e política de dados aprovadas; nunca realizar auto-merge baseado apenas em IA.
