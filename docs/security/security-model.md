# Segurança, privacidade e resposta

Modelo de projeto inspirado em [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) e [OWASP Top 10](https://owasp.org/www-project-top-ten/), com nível alvo ASVS 2 como proposta antes de dados reais. Referências não significam certificação ou controles já implementados.

## Threat model inicial

| Fronteira/ameaça                      | Controle planejado                                                   | Evidência exigida                                                    |
| ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Browser → API: identidade falsificada | OIDC com issuer/audience/assinatura verificados; sessão segura       | Tokens expirados, audiência errada e revogação                       |
| Tenant A → tenant B: IDOR             | Associação server-side, repositório escopado, FK composta e RLS      | Testes negativos com role não privilegiada                           |
| Importação: payload malicioso         | Allowlist, limite, parser seguro e quarentena quando houver arquivos | Payload acima do limite, MIME divergente, XML sem entidades externas |
| API → fornecedor: SSRF                | Hosts autorizados, segredo por organização, timeout                  | URL privada/redirect indevido bloqueados                             |
| Dados → logs/IA: exfiltração          | Allowlist de campos, minimização, sem dados reais em prompts         | Teste com sentinelas e revisão de atributos OTEL                     |
| CI → supply chain                     | Lockfile, permissões mínimas, audit, scan e revisão de dependências  | Relatório e tratamento de achados                                    |

## Identidade e RBAC propostos

Desenho específico da primeira vertical: [RFC 0001](../rfc/0001-identity-membership-isolation.md), [threat model](identity-tenancy-threat-model.md) e [plano de testes](../engineering/identity-tenancy-test-plan.md). Controles propostos não representam autenticação ou RLS já implementados.

Verificação de access tokens está implementada na API, com Keycloak de desenvolvimento ([ADR 0006](../adr/0006-development-identity-provider.md)). Login/sessões BFF e consulta de vínculos ativos também estão implementados nos ADRs 0007/0008; provedor e operação de produção permanecem pendentes. A consulta usa leitura; as rotas administrativas verificam administrador ativo dentro da transação, compartilham locks e gravam auditoria atômica conforme ADRs 0010–0012. Revogação nega consultas posteriores ao commit. Concessão não cria identidades nem reativa vínculos. Permissões fiscais e RLS permanecem pendentes. Papéis propostos para futuras ações: organization_admin gere associações; analyst importa e investiga; reviewer registra parecer; viewer apenas lê resultados autorizados. Permissões serão verificadas no caso de uso, não somente na UI. Credencial de parceiro terá escopos explícitos, rotação e limite de taxa. Membership ativa determina acesso à organização; header isolado não autoriza.

## LGPD e dados

Inventariar finalidades, categorias, fluxo, operadores e bases legais com responsável jurídico antes de dados reais. Consultar [texto oficial da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm); este documento é plano de engenharia, não parecer jurídico. SST pode conter dado sensível e requer segregação adicional. MVP usa apenas material sintético e não precisa receber CPF, prontuários ou salários.

Retenção proposta para fontes sintéticas: apagar após piloto; retenção de fontes reais/auditoria depende de obrigação aplicável, contrato e finalidade. Não inventar prazo fiscal universal. Definir matriz por categoria, exclusão verificável, legal hold, anonimização e tratamento em backups antes de operação real. Criptografia em trânsito e repouso depende do ambiente; segredo de fornecedor/certificado deve ir em vault, nunca banco em texto puro ou repositório.

AuditEvent futuro: tenant, actor interno, action, resourceType/resourceId, instante UTC, requestId, resultado e referência de evidência; sem cópia integral de documento. Imutabilidade e acesso de auditor precisam ser testados; append-only não é garantia contra administrador de banco. Correlacionar ação aprovada com alteração na mesma transação.

## Incidentes

Responsável operacional ainda pendente. Ao detectar exposição: preservar evidências com acesso restrito, conter credenciais/rota, avaliar tenants afetados, comunicar responsável por privacidade e jurídico, cumprir notificações aplicáveis conforme avaliação e norma vigente, corrigir e testar regressão. Não publicar dados de vítimas em issue. Restaurar somente após teste e revisão. [Política de reporte](../../SECURITY.md).
