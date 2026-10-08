# Validação das sessões BFF

Etapa autorizada após a autenticação da API: login OIDC, callback, consulta de sessão e logout. Decisão e contrato no [ADR 0007](../adr/0007-bff-session-storage.md). Nenhum tenant ou privilégio de negócio é concedido pelo login.

## Comportamentos e evidências

Handlers foram iniciados com resposta 503: o teste de login esperava 302 e falhou antes da implementação. O teste de CSRF multibyte esperava 403, recebeu 503 e levou à comparação por comprimento em bytes. A interface começou sem estado de loading e falhou na busca por role status. Um teste adicional de indisponibilidade do provedor detectou classificação incorreta como login inválido; a correção preserva o erro operacional. Esses são Reds comportamentais observados; falha inicial de conexão PostgreSQL não foi considerada TDD.

Testes do adaptador OIDC usam HTTP controlado e ID tokens assinados em memória: state, nonce, assinatura e passagem do verifier. PostgreSQL real isolado demonstra criptografia, hash do cookie, expiração, revogação entre instâncias e consumo atômico concorrente. Os testes de persistência complementam a implementação; não são apresentados como ciclo Red/Green integral. RTL valida estados, retry, CSRF no logout, payload inesperado e axe.

`pnpm test:coverage` mede UI e núcleo BFF separadamente com os mesmos mínimos de cobertura. Wrappers Next e runtime server-only são exercitados pelo job de jornada real, não pela instrumentação Jest. `pnpm test:integration` exige banco sintético isolado. `pnpm test:e2e` mantém a jornada operacional; `pnpm test:e2e:auth` exige Keycloak e cria/remove um usuário sintético temporário, sem token ou senha em logs.

CI `identity-provider` inicia Keycloak e PostgreSQL efêmeros, aplica migrations e executa login pelo formulário real, callback, consulta de sessão, CSRF inválido e logout. Essa jornada não demonstra membership/RLS nem toda a matriz E2E-01. Sem Docker neste ambiente local, o fluxo real do provedor depende da execução remota; consultar os checks da PR para seu resultado.

Primeira execução remota detectou que Next normaliza URLs de loopback para localhost. BFF passou a validar Host contra a origem configurada e construir o callback nessa origem, preservando a validação exata de Origin no logout. Dois testes falharam antes da correção: normalização rejeitada e Host não confiável aceito. Smoke local do build confirma 401 sem sessão com essa configuração. Proxy de produção deve preservar o Host canônico; headers forwarded não são usados para decidir o destino. O runner renova a autenticação administrativa antes de remover a conta sintética, pois o token do realm master pode expirar durante o startup do Cypress.

## Limites e revisão

CodeRabbit revisou o commit 13b68e6 e apontou três achados menores: pré-requisitos do ambiente, sessão expirada ao retornar à página e CSRF desatualizado após outro login. Pré-requisitos foram explicitados; dois testes reproduziram as falhas da UI antes da correção. A interface reconsulta ao ganhar foco/visibilidade e atualiza CSRF no recheck do logout.

A segunda jornada remota foi cancelada por travamento do Cypress, sem declarar login aprovado. Credenciais são agora lidas dentro do contexto cy.origin, conforme [documentação oficial do Cypress](https://docs.cypress.io/api/commands/env). Checkpoints registram somente nomes fixos de etapas; screenshots sintéticos têm retenção de sete dias e a etapa possui timeout de quatro minutos. Conferir a execução posterior para o resultado real.

Verificações locais concluídas: 131 testes com cobertura (65 API, 12 contratos, 23 web, 31 núcleo BFF), 11 integrações PostgreSQL 18.1 e duas jornadas operacionais Cypress/Chrome. Typecheck, lint, build, smokes OTLP/autenticação, formato e links documentais passaram. Audit sem vulnerabilidade alta/crítica; permanece um alerta moderado em dependência de desenvolvimento já registrado na etapa anterior. O login real com Keycloak será validado no job remoto desta PR.

Sessão termina antes do access token, limitada a 299 segundos e descontando a latência da troca/verificação. O teste de atraso de cinco segundos falhou antes dessa correção e passou depois. A interface oferece login quando logout detecta sessão expirada, também com Red/Green observado. Refresh token não é persistido. Logout revoga somente a sessão BFF, sem encerrar SSO no provedor. Chave de criptografia consistente é obrigatória entre instâncias; alteração invalida os registros existentes. Endpoints retornam erros sanitizados e no-store; logs de requisições Next são desabilitados para evitar código na URL.

Produção exige HTTPS, papel PostgreSQL restrito ao schema auth_bff, gestão/rotação de chaves, política de limpeza periódica, limites de abuso e revisão humana de segurança. A limpeza atual ocorre ao inserir registros; entradas expiradas nunca são aceitas. Deploy e configuração produtiva não fazem parte desta entrega.

Rollback: reverter o código da etapa e desabilitar os endpoints BFF; preservar a migration aditiva e dados existentes. Remoção do schema só em mudança explícita, após confirmar ausência de sessões necessárias. Membership, autorização por tenant e RLS são o próximo módulo independente.
