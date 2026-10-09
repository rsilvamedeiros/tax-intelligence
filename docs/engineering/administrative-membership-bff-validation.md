# Validação do BFF administrativo de memberships

Escopo: [ADR 0014](../adr/0014-administrative-membership-bff.md).

## Plano

Documentação e autorização antes do código. Executar Red/Green por fronteira, verificações de contrato e segurança, regressões completas, rotas compiladas e jornada real Keycloak/Chrome. Registrar bloqueios/falhas sem mudar assertions ou thresholds. Conferir Actions, GitGuardian e revisão efetiva antes da aprovação humana.

## Estado

O registro remoto da etapa anterior veio nesta branch porque a PR #14 foi integrada antes daquele commit documental; a feature anterior já está em main. ADR e AGENTS deste módulo foram commitados antes do código/testes.

## TDD observado

Leitor existente ainda não retornava csrfToken e aceitava strings malformadas: 4 falhas e 1 teste aprovado. Handler provisório retornava 503: 37 falhas, 3 cenários de falha já aprovados. Execução conjunta: 41 falhas e 4 testes aprovados, pela capacidade ausente, sem import ou toolchain quebrados. Após implementação, 45 testes passaram.

Revisão local identificou resposta 405 sem Allow. Assertion adicional no cenário existente falhou pelo header ausente antes da correção. A correção fornece o método aceito; não alterar a contagem artificialmente para esse ajuste.

Jornada real foi estendida depois da implementação dos handlers; é validação complementar, não TDD retroativo.

Primeira jornada Keycloak/Chrome alcançou login, listagem, concessão, troca de papel e paginação, mas o primeiro DELETE respondeu 400 em vez de 204. Adapter Next fornece stream vazio para requisição sem bytes; a checagem de presença do stream era incorreta. Novo teste com stream vazio reproduziu 400 antes da correção. Leitura limitada a zero bytes aceita DELETE vazio e mantém rejeição/cancelamento de conteúdo. Nenhuma assertion/timeout da jornada foi alterada para ocultar a falha.

Nova execução da jornada compilada passou localmente com Keycloak 26.8.0 e Chrome 152: login/PKCE, seleção, tentativa cruzada, CSRF/origem, concessão repetida, mudança de papel, paginação, DELETE repetido, conflito de reativação, segundo administrador, auto-rebaixamento com token válido e logout. São 3 jornadas locais aprovadas no total, contando as duas de fundação. O teste novo do stream vazio levou o conjunto focado a 46 testes aprovados.

## Verificações locais

Lint, tipos e build aprovados; duas rotas administrativas presentes no build Next. Cobertura final: 338 testes (API 176, contratos 35, web 38, BFF 89), thresholds preservados. PostgreSQL isolado: 70 testes aprovados. Integração da API compilada com RSA e role restrita aprovada, incluindo regressões administrativas. Smoke OTLP/autenticação e smoke do provedor real aprovados. Instalação congelada aprovada, lockfile preservado. Audit retornou exit 0 com uma vulnerabilidade moderada, sem high/critical. Formato e validador documental aprovados (82 Markdown e 16 skills).

Primeira cobertura passou com aviso de worker Jest encerrado à força nos 38 testes existentes de componentes/health. Diagnóstico posterior `jest --config jest.config.cjs --runInBand --detectOpenHandles` passou nos mesmos 38 testes, sem aviso ou handles reportados. Causa não determinada; não houve alteração em assertions, timeouts, configuração de workers ou thresholds.

Revisão local: sessão/CSRF vinculados, bytes limitados em stream, host/origin, URLs/métodos/corpo fechados, status/headers sanitizados, privilégio mínimo e cleanup por IDs próprios. Sem achado bloqueante remanescente após corrigir 405/Allow e DELETE vazio. Isso não substitui revisão independente/aprovação humana. Serviços locais pertencentes à tarefa encerrados após as jornadas; nenhum processo do usuário foi encerrado.

## Limites e revisão remota

UI administrativa, criação de identidade, reativação e RLS permanecem pendentes. BFF segue sem acesso SQL de domínio, sem migration/dependência nova. Timeout/erro de rede pode ocorrer após commit da API: usar idempotência existente e consultar novamente. Nenhum merge/deploy automático.

Checks remotos e revisão efetiva ainda pendentes. Registrar resultados reais e conferir também commit statuses externos.
