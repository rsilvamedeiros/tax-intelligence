# Fluxo de engenharia, commits e revisão

Documentação e contratos precedem implementação. Para cada módulo: delimitar caso de uso, registrar aceite e riscos, escrever teste comportamental, observar falha esperada, implementar mínimo, refatorar, executar verificações e revisar diff. Mudanças de documentação não requerem testes de aplicação; validar links, formato e coerência.

## Git e aprovação por etapa

Trunk-based com branches curtas de escopo único e PR para `main`. Nome sugerido `docs/product-foundation`, `docs/architecture-foundation`, `chore/technical-bootstrap` ou `feat/<module>-<capability>`. GitFlow apenas se versões sustentadas simultâneas justificarem, com ADR.

Commits separados por módulo ou entrega coerente; não dividir artificialmente teste e código deixando histórico aprovado quebrado. Usar mensagem em inglês, objetiva e de uma linha, sem description/body, assinatura de IA ou trailer Co-Authored-By. Exemplos: `docs: define product scope`, `docs: record persistence strategy`, `test: cover readiness failures`, `chore: configure workspace`, `feat: add synthetic document import`, `fix: enforce tenant scope`. Autor é a identidade Git já configurada; não substituir nem ocultar autoria real.

Autorização vigente do usuário: fazer commits separados desta entrega, incluindo AGENTS e skills, após checks e revisão; abrir PR automático conforme solicitado. Isso autoriza o push da branch necessária ao PR, sem incluir outros arquivos locais preparados. Não pedir novamente confirmação para os commits desta entrega. Autorizações futuras prevalecem. Não fazer merge automático ou mudar branch protection. Fase 5 exige autorização própria, mesmo com commits automáticos habilitados.

Agrupamento sugerido da documentação para revisão: `docs: define product scope` (produto/roadmap), `docs: define platform architecture` (contextos/ADRs/integrações), `docs: establish engineering workflow` (TDD/segurança/entrega), `docs: add agent engineering skills` (AGENTS/playbook/skills) e `docs: connect foundation documentation` (índices/guias/templates/evidências). Validar o conjunto do PR após esses commits; não misturar apps, dependências ou migrations nesses grupos. O validador documental pode acompanhar o último grupo com `chore: add documentation validation`.

## Descrições de PR

Títulos, descrições de PR e comentários de revisão publicados devem ser escritos em inglês. Descrições curtas: problema e resultado em uma ou duas frases, checks realmente executados e riscos relevantes. Usar o [template](../../.github/pull_request_template.md) proporcionalmente à mudança, removendo seções sem conteúdo aplicável. Evitar histórico da conversa, repetição e checklists genéricos no corpo do PR. A documentação do repositório continua em pt-BR.

## Definition of Ready

Domínio e owner identificados; exemplo observável; critérios de aceite, autorização e riscos claros; contrato e fonte normativa quando pertinentes; dados sintéticos e estratégia de teste disponíveis; dependências externas explicitadas.

## Definition of Done

Aceite demonstrado; testes relevantes executados; lint, tipos e build aplicáveis aprovados; revisão sem achados bloqueantes; documentação/ADR/contrato atualizados; migrations reversíveis por estratégia documentada; evidências de comandos e falhas reais; PR de escopo único e aprovação humana em mudanças críticas.

## Revisão em cinco camadas

1. Estática: formato, lint, TypeScript, testes, build e contrato.
2. Segurança: segredos, dependências, tenant, autorização, upload e dados em logs.
3. Arquitetura: imports permitidos, contextos, consistência e complexidade.
4. IA: achados com severidade, arquivo, linha, evidência, impacto e sugestão.
5. Humana: obrigatória para autenticação, isolamento, regras fiscais, dados pessoais, migrations destrutivas e releases.

Severidades: critical = exposição/alteração de dados entre clientes; high = bypass de acesso, cálculo errado ou corrupção; medium = falha reproduzível sem essas consequências; low = melhoria justificada. IA não aprova código crítico nem substitui testes. Comentários cosméticos não bloqueiam merge.

Sem credenciais disponíveis, preparar contrato do reviewer e execução manual; não afirmar revisão independente ou automação remota já ativa. [Playbook de IA](../ai/playbook.md).

Antes de declarar o PR aprovado nos checks, consultar também checks de apps externos e commit statuses, além dos workflows Actions. Se um scanner apontar interpolação em vez de credencial, registrar a evidência e conferir o novo resultado; não suprimir automaticamente o alerta nem reescrever histórico publicado para obter aprovação.
