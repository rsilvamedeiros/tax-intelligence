# Validação da concessão administrativa

Escopo e critérios no [ADR 0012](../adr/0012-membership-grants.md). ADR, aceite e este documento foram registrados antes da implementação, após integração do PR #12. Etapa restrita a vínculos de atores já existentes.

## Evidência de TDD

| Fronteira       | Red observado                                          | Green observado                                                     |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Caso de uso     | 8 falhas com concessão indisponível                    | 8 testes; identidade verificada, erros e resultado inesperado       |
| HTTP Nest       | 14 falhas e 1 aprovação com PUT ausente                | 15 testes; o cenário 404 já coincidia com a rota ausente            |
| PostgreSQL real | 11 falhas e 4 aprovações com adapter negando operações | 15 testes iniciais; mais 4 verificações escritas após implementação |

Migration e fixtures precederam os testes do adapter; não são apresentadas como TDD de schema. Contrato de papel existente foi reutilizado, com seus testes preservados. As quatro verificações adicionais não são apresentadas como Red inicial.

## Comportamentos verificados

- Bearer antes de validação do controller; UUIDs, query vazia e `{role}` fechado. Headers, claims de papel e campos adicionais não concedem administração. OpenAPI e runtime usam o mesmo schema de papel.
- Atores inexistentes somente retornam 404 após autorização administrativa. Viewer, iniciador desconhecido/revogado e administrador de outra organização recebem 403 antes da consulta do alvo.
- Concessão para cada papel, repetição sem evento, papel diferente como 409 e vínculo revogado como 409, sem criação de identidade, alteração de papel ou reativação.
- Concessão e evento são atômicos. Falta de INSERT na auditoria reverte o vínculo e gera 503 sanitizado pela API.
- Concessões simultâneas criam um vínculo/evento. Papéis iguais retornam granted/unchanged; diferentes retornam granted/conflict, sem substituição silenciosa.
- Concessão/revogação são serializadas pelo mesmo lock. Um iniciador revogado enquanto aguarda perde permissão antes de inserir o vínculo. A ordenação é demonstrada por `pg_blocking_pids`; intervalo de polling não é a prova.
- Conceder segundo administrador permite revogar o original; o original perde autorização e não pode ser reativado via PUT. Identidade global pode ter vínculo em outra organização mediante administrador ativo no destino.
- Runtime não pode inserir revoked_at, criar atores, apagar memberships nem ler/atualizar/apagar/truncar eventos. FKs compostas e vocabulário fechado são verificados.
- API compilada com JWT RSA efêmero demonstra ausência de acesso antes da concessão, acesso/papel após commit, repetição sem evento, conflito de papel, revogação posterior e retry sem reativação. Logs e erros não contêm sentinelas sensíveis.

## Execução local

Node 24.21.0, pnpm 10.24.0 e PostgreSQL 18.1 isolado, com dados sintéticos e role SQL restrita. Sem novas dependências, alterações em migrations anteriores ou redução de cobertura.

| Verificação                       | Resultado                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Lint, tipos e build               | Aprovados                                                                        |
| Cobertura sequencial de pacotes   | 265 testes: API 154, contratos 28, web 38 e BFF 45; limites preservados          |
| PostgreSQL                        | 61 testes, incluindo 19 de concessão; regressões de papéis/revogação preservadas |
| API compilada, RSA e SQL restrito | Aprovada                                                                         |
| Smokes OTLP e autenticação        | Aprovados pelo comando padrão                                                    |

A primeira integração compilada falhou ao revogar o vínculo recém-concedido: a fase anterior de teste havia retirado INSERT da auditoria de revogação. A fixture foi corrigida para restaurar esse privilégio antes do cenário, e a integração passou. Nenhuma mudança de produção foi necessária.

A primeira execução paralela da cobertura falhou no teste existente de logout da web, ao aguardar a listagem sintética. A execução completa com `pnpm test:coverage --concurrency=1` passou sem editar testes, assertions ou thresholds. A causa da falha inicial não foi determinada; a CI padrão deve ser avaliada separadamente.

Fundação no Chrome: duas jornadas aprovadas. Formato e documentação: aprovados, com 78 Markdown e 16 manifests de skills. Instalação frozen aprovada; audit sem alto/crítico, com um alerta moderado preexistente.

O primeiro smoke do Keycloak recém-iniciado encerrou por timeout; a repetição passou com discovery, PKCE e JWKS reais. Não houve alteração no timeout do script. A causa da falha inicial não foi determinada.

A primeira execução padrão da jornada autenticada encerrou com erro genérico antes do resultado Cypress. A execução diagnóstica alcançou o navegador, mas falhou no prazo de 60 segundos para carregar a página após clicar em Entrar; o screenshot também mostrou a consulta de health indisponível. Uma repetição padrão chegou ao callback BFF, que retornou 503 em vez de 303. Não houve mudança nas assertions ou no pageLoadTimeout. A máquina tinha aproximadamente 391 MB livres de 8 GB durante a investigação; isso é pressão de recursos observada, não causa comprovada. A jornada autenticada local não foi aprovada; a CI precisa ser avaliada separadamente.

## Limites e rollback

Bootstrap de primeiro administrador e provisionamento de identidade continuam operacionais; PUT exige ator e administrador já existentes. Não há convite, busca global, UI administrativa, acesso adicional da web ao banco, RLS ou regra fiscal. SQL arbitrário com credencial comprometida pode ignorar políticas da aplicação; grants não substituem RLS. O proprietário do banco continua podendo alterar eventos. Rollback desabilita PUT e remove grants adicionais, preservando migration/auditoria.
