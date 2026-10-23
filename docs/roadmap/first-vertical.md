# Primeira vertical: interface sintética, prova OTLP específica pendente

Etapa atual: interface do [ADR 0027](../adr/0027-synthetic-diagnostic-ui.md), com [validação](../engineering/synthetic-diagnostic-ui-validation.md). Lote tem contrato/persistência/API/BFF/UI nos ADRs 0017–0021; diagnóstico tem núcleo/casos de uso/persistência/API/BFF nos ADRs 0022–0026. Interface em branch dependente da PR #31, aberta no início. Repetição natural e evidência não têm validade fiscal. Prova OTLP específica e aceite completo ainda pendentes.

Fluxo da [RFC 0003](../rfc/0003-synthetic-document-intake.md): criação e consulta na API, BFF e interface, com RLS/auditoria nas tabelas sintéticas. [Plano TDD parcialmente executado](../engineering/synthetic-document-intake-test-plan.md); jornada de diagnóstico implementada por etapas exige prova OTLP específica e revisão do aceite antes de declarar a vertical completa. A PR #19 concluiu apenas a prova RLS isolada.

Objetivo: demonstrar rastreabilidade ponta a ponta sem calcular tributo ou transmitir obrigação. Passos: organização → associação autorizada → JSON sintético → validação → persistência → regra determinística demonstrativa → achado/evidência → auditoria → REST → frontend → testes e traces.

Núcleo da regra demonstrativa `DEMO-TOTAL-001` implementado no [ADR 0022](../adr/0022-synthetic-diagnostic-core.md): comparar total informado com soma de linhas usando centavos inteiros. Fonte: especificação de fixture do projeto, **sem fonte normativa e sem validade fiscal**. Jurisdição: não aplicável. Versão: 1.0.0; vigência: não aplicável. O recorte puro foi seguido por persistência, API, BFF e interface nos ADRs 0023–0027. [Validação](../engineering/synthetic-diagnostic-core-validation.md). Qualquer regra real precisa do registro abaixo e aprovação especializada.

Registro de regra real: ID, referência normativa e trecho verificável, jurisdição, vigência inicial/final, versão, condições, entradas, método determinístico, evidências, resultado, rastreabilidade e reviewer humano. Retificações não devem alterar silenciosamente resultados históricos; gerar nova execução com fonte/versionamento explícitos.

## Ordem de TDD proposta

Preparação de identidade e isolamento detalhada na [RFC 0001](../rfc/0001-identity-membership-isolation.md), com [ameaças](../security/identity-tenancy-threat-model.md) e [casos de teste](../engineering/identity-tenancy-test-plan.md). Autenticação, sessões, memberships/administração e prova RLS isolada foram implementadas por etapas. A matriz registra evidências parciais; RLS de domínio e testes desta vertical continuam pendentes.

1. Autorização: sem identidade rejeita; tenant não associado rejeita; escolha de tenant não é confiada ao payload.
2. Domínio puro: entrada válida, negativa, overflow/precisão, total correspondente/divergente; sem banco.
3. Aplicação: escopo obrigatório, deduplicação e mesmo comando produz resultado equivalente.
4. Banco real: constraints, rollback incluindo auditoria, concorrência de chave e RLS com role restrita.
5. HTTP e contrato: validação, erros, ID externo ao tenant vira 404 e resposta sem dados extras.
6. UI: loading/vazio/erro/sucesso/evidência; E2E com dois tenants e sessão real sintética.

Critérios bloqueantes: qualquer leitura cruzada, segredo/log sensível, regra não reproduzível, efeito sem auditoria ou sucesso parcial persistido. Cobertura sozinha não aprova. Commit por módulo coerente após checks e revisão, PR com evidências. Tabelas/autorização estão no ADR 0018; API no ADR 0019, BFF no ADR 0020 e UI no ADR 0021. Diagnóstico registrado e interface estão descritos nos ADRs 0023–0027; não antecipar dados reais.
