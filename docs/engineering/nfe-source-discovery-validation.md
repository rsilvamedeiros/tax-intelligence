# Validação — Preparação documental da fonte NF-e

Data: 23/10/2026. [ADR 0029](../adr/0029-nfe-source-discovery.md), [dossiê](../integrations/nfe-xml-assessment.md), [RFC 0004](../rfc/0004-nfe-xml-intake.md) e [matriz de TDD](nfe-xml-test-plan.md). Entrega documental, sem implementação ou documento real.

## Pesquisa executada

Consultados por navegação pública o PDF oficial CONFAZ do MOC 7.0, Anexo I, e o catálogo técnico da SEFAZ Virtual RS. O endereço de schemas do Portal Nacional apresentou loop de redirecionamento na ferramenta; não foi usado acesso autenticado ou tentativa de contornar proteção. Nenhum pacote XSD, chave privada, nota fiscal ou arquivo de cliente foi baixado. Versão/hash do pacote e aplicabilidade das notas técnicas continuam pendentes; não há homologação de schema.

Recomendação para revisão: avaliar XML de NF-e modelo 55 fornecido por representante autorizado, começando por fixtures artificiais. Trata-se de escolha candidata, sem aprovação automática de fonte, parser, importação real ou regra fiscal. A RFC explicita verificação estrutural separada de assinatura, autenticidade, protocolo declarado e situação fiscal atual.

## Validação e revisão local

`node scripts/validate-docs.mjs`: links internos, Markdown e manifests das skills validados; não verifica URLs externas ou âncoras. `pnpm format:check` e `git diff --check` aprovados antes dos commits. As fontes externas foram verificadas pela pesquisa descrita no dossiê, com a falha de navegação registrada.

Autorrevisão documental, segurança e arquitetura: escopo proposto identificado, limites internos separados dos oficiais, nenhum cálculo/tributo inferido, sem novo acesso a dados, dependência ou migration. TDD está planejado, não executado; testes de aplicação/banco não foram repetidos localmente para mudanças exclusivamente documentais. CI e revisão externa da nova entrega ainda pendentes nesta preparação; não afirmar aprovação por evidência de outro head.

## Continuidade da PR #33

A dependência #32 foi integrada. Verificados os oito checks verdes do head afa4c7e; PR #33 direcionada para main e marcada pronta para revisão por mutação do GitHub, sem merge. Nova revisão CodeRabbit solicitada em [comentário próprio](https://github.com/rsilvamedeiros/tax-intelligence/pull/33#issuecomment-6374135174); aceita e em andamento nesta preparação. Isso substitui a antiga pendência de quota somente quanto à solicitação, não prova revisão concluída.

Próximo ponto de decisão: revisão/aceite da vertical demonstrativa e aprovação do recorte da RFC 0004. Antes do parser, obter e fixar schemas oficiais e confirmar constraints aplicáveis. Banco, upload, assinatura, dados reais e produção continuam exigindo etapas próprias. Nenhum deploy ou merge automático executado.
