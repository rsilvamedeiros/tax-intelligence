# Validação da alteração de papéis

Escopo no [ADR 0011](../adr/0011-membership-role-changes.md), após PR #11. ADR, critérios de aceite e este documento foram registrados antes da implementação. Etapa restrita à alteração de papéis de vínculos ativos existentes pela API.

## Evidência de TDD

| Fronteira               | Red observado                                         | Green observado                                                          |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Contrato compartilhado  | 3 falhas e 7 aprovações com schema permissivo         | 10 testes; enum fechado e corpo estrito                                  |
| Caso de uso             | 7 falhas com implementação indisponível               | 7 testes iniciais; oitavo teste adicional de resultado inesperado        |
| HTTP Nest               | 14 falhas e 1 aprovação com rota ausente              | 15 testes; a resposta 404 já coincidia com um cenário negativo           |
| Persistência PostgreSQL | 4 falhas e 4 aprovações com adapter negando operações | 8 testes iniciais; 4 verificações adicionais de segurança e concorrência |

Os testes adicionais foram escritos após a implementação e não são apresentados como Red inicial. Migration e preparação das fixtures precederam os testes do adapter. Erros transitórios de edição não contam como evidência de TDD.

## Comportamentos verificados

- Bearer validado antes dos seletores e do corpo no controller; JSON malformado pode ser rejeitado pelo parser antes dele. UUIDs, query vazia e corpo `{ role }` estrito; contrato OpenAPI com os mesmos limites.
- Identidade externa resolve o ator interno. Claims de papel e dados enviados pelo cliente não concedem administração. A permissão ativa é consultada dentro da transação, após o lock da organização.
- Administrador pode promover e rebaixar vínculo ativo. Papel igual retorna 204 sem evento duplicado. Vínculo ausente ou revogado retorna 404 somente após autorização; não há criação ou reativação.
- Último administrador não pode ser rebaixado. Autorrebaixamento exige outro administrador. Token ainda válido perde permissão administrativa assim que o vínculo é rebaixado.
- Alteração e auditoria são atômicas; retirar permissão de INSERT da auditoria provoca rollback e erro HTTP 503 sanitizado.
- Runtime não pode ler, alterar, apagar ou truncar a auditoria, criar identidades ou apagar memberships. FKs compostas rejeitam atores de outra organização; constraints rejeitam papel inválido e evento sem mudança.
- Alteração de papel e revogação usam o mesmo lock canônico. Operações concorrentes preservam um administrador; uma operação em espera revalida o papel do iniciador depois de adquirir o lock.
- Os 14 testes existentes de revogação continuam aprovados após extração do protocolo privado compartilhado por dois adapters.

## Execução local

Node 24.21.0, pnpm 10.24.0 e PostgreSQL 18.1 isolado, com dados sintéticos e usuário SQL restrito. Nenhuma alteração em migrations anteriores, dependências ou limites de cobertura.

| Verificação                                            | Resultado                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Lint, tipos e build                                    | Aprovados                                                                                              |
| Cobertura                                              | 242 testes: API 131, contratos 28, web 38 e BFF 45; limites preservados                                |
| Integração PostgreSQL                                  | 42 testes, incluindo 12 novos testes de papéis                                                         |
| API compilada + RSA + PostgreSQL                       | Aprovada; promoção, rebaixamento, perda de autorização, consulta do novo papel e rollback da auditoria |
| Smoke OTLP e autenticação, execução direta dos scripts | Aprovados                                                                                              |

`pnpm test:smoke` falhou três vezes no prazo de readiness da API, sem encerramento antecipado do processo. Diagnóstico e execução direta passaram. Depois de concluir o navegador e encerrar os processos locais de Keycloak/PostgreSQL, o comando padrão também passou. A causa da instabilidade inicial não foi determinada; não houve aumento de timeout nem remoção de assertions. O resultado da CI deve ser avaliado separadamente.

Keycloak real: discovery/PKCE/JWKS aprovados. Chrome: três jornadas aprovadas, duas de fundação e uma autenticada. A primeira execução autenticada encerrou antes do resultado Cypress com erro genérico do runner; diagnóstico e repetição do comando padrão `pnpm test:e2e:auth` passaram. A falha inicial não foi reproduzida nem teve causa determinada.

Formato, links e manifests: aprovados, com 76 Markdown e 16 skills. Instalação frozen aprovada; audit sem alto/crítico, com um alerta moderado preexistente.

## Limites

A auditoria é protegida pelos grants do runtime, não contra o proprietário do banco. SQL arbitrário com a credencial técnica continua sendo risco; RLS permanece pendente. O protocolo compartilhado protege os caminhos administrativos implementados, não escritas externas que ignorem esse protocolo. Concessão de vínculos, administração no BFF/UI e ações fiscais exigem etapas próprias.
