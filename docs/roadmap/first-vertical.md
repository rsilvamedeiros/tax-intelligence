# Primeira vertical: proposta, implementação não autorizada

Objetivo: demonstrar rastreabilidade ponta a ponta sem calcular tributo ou transmitir obrigação. Passos: organização → associação autorizada → JSON sintético → validação → persistência → regra determinística demonstrativa → achado/evidência → auditoria → REST → frontend → testes e traces.

Regra de demonstração proposta `DEMO-TOTAL-001`: comparar total informado com soma de linhas usando centavos inteiros. Fonte: especificação de fixture do projeto, **sem fonte normativa e sem validade fiscal**. Jurisdição: não aplicável. Versão: 1.0.0; vigência: não aplicável. Resultado: divergência estrutural demonstrativa, sem recomendação tributária. Qualquer regra real precisa do registro abaixo e aprovação especializada.

Registro de regra real: ID, referência normativa e trecho verificável, jurisdição, vigência inicial/final, versão, condições, entradas, método determinístico, evidências, resultado, rastreabilidade e reviewer humano. Retificações não devem alterar silenciosamente resultados históricos; gerar nova execução com fonte/versionamento explícitos.

## Ordem de TDD proposta

Preparação de identidade e isolamento detalhada na [RFC 0001](../rfc/0001-identity-membership-isolation.md), com [ameaças](../security/identity-tenancy-threat-model.md) e [casos de teste](../engineering/identity-tenancy-test-plan.md). Provedor e implementação ainda pendentes; testes desse plano não foram executados.

1. Autorização: sem identidade rejeita; tenant não associado rejeita; escolha de tenant não é confiada ao payload.
2. Domínio puro: entrada válida, negativa, overflow/precisão, total correspondente/divergente; sem banco.
3. Aplicação: escopo obrigatório, deduplicação e mesmo comando produz resultado equivalente.
4. Banco real: constraints, rollback incluindo auditoria, concorrência de chave e RLS com role restrita.
5. HTTP e contrato: validação, erros, ID externo ao tenant vira 404 e resposta sem dados extras.
6. UI: loading/vazio/erro/sucesso/evidência; E2E com dois tenants e sessão real sintética.

Critérios bloqueantes: qualquer leitura cruzada, segredo/log sensível, regra não reproduzível, efeito sem auditoria ou sucesso parcial persistido. Cobertura sozinha não aprova. Commit por módulo coerente após checks e revisão, PR com evidências. Não criar tabelas, guards, casos de uso ou regra desta vertical antes da confirmação explícita.
