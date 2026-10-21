# Segurança, privacidade e resposta

Interface sintética do [ADR 0021](../adr/0021-synthetic-document-ui.md): comando/chave somente em memória, sem tokens ou documentos em storage. Organização, sessão/CSRF e papel delimitam a instância visual; desmonte aborta requests e respostas tardias não restauram dados. Visibilidade dos controles não concede acesso: a API revalida membership. Após efeito incerto, repetir exige o mesmo comando/chave; após sucesso, uma nova criação exige ação explícita. Sem cálculo fiscal ou ampliação do acesso SQL pela web.

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

BFF sintético no [ADR 0020](../adr/0020-synthetic-document-bff.md): token da sessão server-side, Origin/CSRF em escrita, seletores e chave validados, JSON UTF-8 e limites de bytes na entrada/saída. Nenhum cache de papel ou novo acesso SQL de domínio na web. API revalida autorização. Repetição após falha conserva comando/chave; sem retry automático. [Evidências](../engineering/synthetic-document-bff-validation.md).

Estado atual do lote sintético: os ADRs 0018/0019 implementam RLS somente nas quatro tabelas novas e POST/GET com Bearer, membership/papel revalidados na transação e pool de domínio dedicado. Perfil excessivo é rejeitado por operação, sem fallback administrativo. Esse recorte não implementa RLS das tabelas de controle nem permite dados fiscais reais. [Evidências e limites](../engineering/synthetic-document-http-validation.md).

A prova sintética do [ADR 0016](../adr/0016-synthetic-rls-proof.md) exercita policies, grants e contexto transacional com login restrito em fixtures descartáveis. RLS-12 explicita o limite de setting mutável: a prova não autentica tenant nem protege runtime com SQL arbitrário comprometido. Nenhuma policy ou grant da aplicação foi alterado; RLS de domínio continua pendente. [Evidências](../engineering/synthetic-rls-validation.md).

BFF administrativo implementado no [ADR 0014](../adr/0014-administrative-membership-bff.md): Bearer da sessão server-side, Origin/CSRF para mutações, payload limitado, resposta sanitizada e permissão administrativa revalidada pela API. Credencial BFF permanece restrita a auth_bff. Interface administrativa implementada no [ADR 0015](../adr/0015-administrative-membership-ui.md), com limpeza de estado por organização/sessão, remoção de controles em 403 e consulta após falha ambígua; visibilidade dos controles não concede autorização. Isolamento RLS continua pendente. [Evidências](../engineering/administrative-membership-ui-validation.md).

Desenho específico da primeira vertical: [RFC 0001](../rfc/0001-identity-membership-isolation.md), [threat model](identity-tenancy-threat-model.md) e [plano de testes](../engineering/identity-tenancy-test-plan.md). Controles propostos não representam autenticação ou RLS já implementados.

Verificação de access tokens está implementada na API, com Keycloak de desenvolvimento ([ADR 0006](../adr/0006-development-identity-provider.md)). Login/sessões BFF e consulta de vínculos ativos também estão implementados nos ADRs 0007/0008; provedor e operação de produção permanecem pendentes. A consulta usa leitura; as rotas administrativas verificam administrador ativo dentro da transação, compartilham locks e gravam auditoria atômica conforme ADRs 0010–0012. Revogação nega consultas posteriores ao commit. Concessão não cria identidades nem reativa vínculos. Permissões fiscais e RLS permanecem pendentes. Papéis propostos para futuras ações: organization_admin gere associações; analyst importa e investiga; reviewer registra parecer; viewer apenas lê resultados autorizados. Permissões serão verificadas no caso de uso, não somente na UI. Credencial de parceiro terá escopos explícitos, rotação e limite de taxa. Membership ativa determina acesso à organização; header isolado não autoriza.

## LGPD e dados

Inventariar finalidades, categorias, fluxo, operadores e bases legais com responsável jurídico antes de dados reais. Consultar [texto oficial da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm); este documento é plano de engenharia, não parecer jurídico. SST pode conter dado sensível e requer segregação adicional. MVP usa apenas material sintético e não precisa receber CPF, prontuários ou salários.

Retenção proposta para fontes sintéticas: apagar após piloto; retenção de fontes reais/auditoria depende de obrigação aplicável, contrato e finalidade. Não inventar prazo fiscal universal. Definir matriz por categoria, exclusão verificável, legal hold, anonimização e tratamento em backups antes de operação real. Criptografia em trânsito e repouso depende do ambiente; segredo de fornecedor/certificado deve ir em vault, nunca banco em texto puro ou repositório.

AuditEvent futuro: tenant, actor interno, action, resourceType/resourceId, instante UTC, requestId, resultado e referência de evidência; sem cópia integral de documento. Imutabilidade e acesso de auditor precisam ser testados; append-only não é garantia contra administrador de banco. Correlacionar ação aprovada com alteração na mesma transação.

## Incidentes

Responsável operacional ainda pendente. Ao detectar exposição: preservar evidências com acesso restrito, conter credenciais/rota, avaliar tenants afetados, comunicar responsável por privacidade e jurídico, cumprir notificações aplicáveis conforme avaliação e norma vigente, corrigir e testar regressão. Não publicar dados de vítimas em issue. Restaurar somente após teste e revisão. [Política de reporte](../../SECURITY.md).
