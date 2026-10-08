# ADR 0005 — Toolchain compatível e verificável

Data: 08/10/2026. Status: decisão técnica desta etapa, aguardando revisão do PR de bootstrap.

## Contexto

O bootstrap deve executar Jest, NestJS e TypeScript strict sem introduzir migração de módulos ou trocar o runner exigido. O primeiro teste com Nest 12.1.2 falhou ao carregar os pacotes ESM no runner CommonJS preparado. O [guia oficial do Nest](https://docs.nestjs.com/migration-guide) descreve essa mudança de distribuição e a necessidade de revisar runners e toolchain.

## Decisão

Node 24 LTS e pnpm 10.24.0; TypeScript 5.9.3; Nest 11.2.7 com Swagger 11.4.7; Next 16.4.0/React 19.3.0; Jest 30.5.2 e SWC para os testes da API. Versões diretas fixadas e lockfile versionado. Nest 12/ESM será reavaliado em atualização própria, com testes e sem migração silenciosa.

ESLint 10.12.0 substitui ESLint 9 sem suporte. O plugin jsx-a11y foi retirado porque sua faixa peer ainda exclui ESLint 10; não desabilitar a verificação de peers para forçar instalação. Acessibilidade continua com HTML semântico, teste axe/RTL e revisão manual prevista. React Hooks permanece como regra de lint.

Chrome é o browser E2E padrão; Electron foi verificado inicialmente, mas o Cypress anunciou sua descontinuação como browser de teste. `E2E_BROWSER` permite escolher outro browser instalado. Usar a [API pública Cypress](https://docs.cypress.io/app/references/module-api), em vez de subpath não exportado. Limpar ELECTRON_RUN_AS_NODE apenas no processo runner evita a interferência de editores baseados em Electron.

## Dependências e segurança

Override restrito `@nestjs/swagger>js-yaml=5.4.1` corrige [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm). Audit de produção passou sem achados conhecidos. `sprintf-js` transitivo de Jest permanece com [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), severidade moderada e sem versão corrigida informada pelo audit. Não ocultar o achado nem aplicar override incompatível sem teste; acompanhar atualização do tooling. Ele não integra o grafo de produção auditado.

Scripts de instalação autorizados são limitados aos necessários para SWC, Nest, Cypress e unrs-resolver. Scripts transitivos de analytics/geração dispensável permanecem bloqueados; não liberar todos os builds por conveniência. Não há credencial, deploy ou proteção de branch provisionados.

## Consequências

Compatibilidade precisa ser reavaliada por atualização, com frozen install, tipos, lint, testes, cobertura, build, smoke OTLP e E2E. A solução preserva o monólito modular e não implementa domínios de negócio. [Evidências do bootstrap](../engineering/bootstrap-validation.md).
