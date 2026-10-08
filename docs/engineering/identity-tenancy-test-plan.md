# Plano de TDD — identidade, membership e isolamento

Status: matriz de referência, com execução parcial descrita abaixo. Sem testes artificiais sobre texto. [RFC 0001](../rfc/0001-identity-membership-isolation.md) e [ameaças](../security/identity-tenancy-threat-model.md).

Atualização após escolha do provedor: casos de assinatura/issuer/audience/algoritmo/tempo de AUTH-01, substituição de ID token de AUTH-06, JWKS/rotação de AUTH-07 e privacidade de logs/respostas de PRIVACY-01 estão exercitados nos testes HTTP da API. Etapa BFF cobre state/nonce/assinatura, verifier encaminhado, replay do callback, returnTo, expiração, CSRF e revogação local persistida; ver [validação BFF](bff-session-validation.md). Rejeição pelo provedor de verifier incorreto, traces autenticados, membership, RLS e E2E-01 completo seguem pendentes. [Evidências da API](authentication-validation.md); não declarar toda a matriz completa com base em autenticação apenas.

## Fixtures e ambiente

Dois tenants sintéticos A/B; actor com membership somente em A, actor em ambos, actor revogado e administrador A sem acesso B. Identidades usam issuer/subject sintéticos, sem pessoas reais. Fixar relógio nos testes de validade; gerar chaves efêmeras no processo e nunca versionar tokens utilizáveis ou chave privada.

HTTP usa aplicação real; servidor OIDC/JWKS controlado para casos criptográficos negativos. E2E de login precisa de provedor OIDC de teste com redirect/code/PKCE reais, sem atalho que injete identidade. Persistência usa TEST_DATABASE_URL em PostgreSQL isolado, role de migrations separada do runtime e asserts de privilégios antes dos testes RLS. Não usar superuser para demonstrar isolamento.

## Matriz de comportamentos

| ID         | Cenário                                                                                       | Resultado esperado / camada                                                            |
| ---------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| AUTH-01    | Sem token; assinatura inválida; expirado; issuer/audience incorretos; algoritmo não permitido | 401, nenhum efeito; HTTP + adaptador                                                   |
| AUTH-02    | State/nonce ou verifier PKCE incompatíveis; code reutilizado                                  | Login negado, nenhuma sessão; integração OIDC                                          |
| AUTH-03    | Redirect não registrado; returnTo externo/protocol-relative                                   | Destino rejeitado; callback/BFF                                                        |
| AUTH-04    | Sessão expirada ou logout seguido de reutilização de cookie                                   | Reautenticação obrigatória; BFF/E2E                                                    |
| AUTH-05    | Mutação com origem externa ou CSRF inválido; sessão válida                                    | Rejeitada sem efeito; BFF/HTTP                                                         |
| AUTH-06    | ID token do BFF enviado à API; token de outra audience                                        | 401; nenhuma consulta de negócio                                                       |
| AUTH-07    | JWKS indisponível sem chave confiável; chave desconhecida; rotação válida                     | Verificação indisponível: 503; token inválido: 401; rotação válida funciona; adaptador |
| ACCESS-01  | Tenant B selecionado em rota/header/payload por actor somente A                               | 403 na seleção; recurso B retorna 404; HTTP/aplicação                                  |
| ACCESS-02  | Viewer tenta importar; admin A tenta conceder role em B; email alterado                       | 403 nas ações; mesma identidade pelo issuer/subject; aplicação                         |
| ACCESS-03  | Revogar membership e repetir ação com access token ainda válido                               | Ação após commit negada; HTTP + banco                                                  |
| ACCESS-04  | Operação concorrente com revoke                                                               | Ordem de locks demonstrada; sem operação nova após revoke confirmado; banco            |
| DB-01      | Query sem filtro executada pelo runtime com contexto A                                        | Apenas linhas A; PostgreSQL/RLS                                                        |
| DB-02      | INSERT/UPDATE troca tenant ou vincula FK de B                                                 | Erro e rollback; policies/constraints reais                                            |
| DB-03      | Actor não associado consulta tabela de controle; organização inexistente                      | Sem enumeração nem vínculo exposto; repositório dedicado                               |
| DB-04      | A → commit → B na mesma conexão; A → rollback → B; falha antes de B                           | Sem contexto A residual; pool real de tamanho 1                                        |
| DB-05      | Conexão sem contexto; verificar role runtime, ownership e BYPASSRLS                           | Sem acesso tenant-owned; privilégio excessivo falha o teste                            |
| DB-06      | Falha ao gravar auditoria de grant/revoke ou efeito de domínio                                | Transação inteira revertida; banco                                                     |
| PRIVACY-01 | Sentinelas em bearer/cookie/email/payload e erro de banco                                     | Nenhuma sentinela em log, trace ou resposta; smoke/HTTP                                |
| PRIVACY-02 | Consultar IDs B e inexistente como actor A                                                    | Mesmo contrato 404 sem detalhes internos; HTTP                                         |
| E2E-01     | Login real sintético → seleção A → ação permitida → tentativa B → logout                      | Jornada permitida em A, B bloqueado e sessão local inutilizada                         |

## Sequência de entregas

1. Aceitar contrato OIDC e sessão, escolher provedor e TTL/skew/refresh; resolver AUTH antes de novas rotas de negócio.
2. Implementar identificação e autorização por comportamento, observando Red válido antes de cada alteração e Green depois.
3. Criar migrations de identidade/membership e provar constraints, locks e lookup dedicado; rever privilégios.
4. Estender persistência tenant-owned com RLS e rodar DB-01 a DB-06 antes de importação.
5. Conferir integração HTTP, privacidade e E2E; só então começar documento/diagnóstico.

Concorrência usa barreiras coordenadas, nunca sleep como evidência de ordenação. Capturar motivo da falha Red e resultado Green por caso; falha de ambiente/import não demonstra TDD. Não reduzir coverage, ignorar falhas ou chamar mock de prova RLS. Fixtures e estado devem ser limpos entre casos; bloquear execução contra banco não isolado.

Aceite: todos os negativos críticos passam, revogação concorrente tem resultado definido, revisão de segurança humana realizada e nenhum segredo/dado real aparece em artefatos. Cobertura e CI verdes complementam esses critérios; não os substituem.
