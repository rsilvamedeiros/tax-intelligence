# ADR 0029 — Preparação documental da primeira fonte fiscal

Data: 23/10/2026. Status: pesquisa e proposta documental autorizadas pelo próximo módulo. A escolha definitiva da fonte e sua implementação permanecem propostas. Dependente da PR #33, aberta no início; PR #32 integrada. Sem parser, upload, migration, credencial, dado real, deploy ou merge automático.

## Problema e alternativas

A demonstração sintética já possui interface e prova OTLP; isso não define uma fonte fiscal nem permite aplicar sua regra demonstrativa a uma nota real. O próximo passo precisa de fonte rastreável e fronteira de segurança antes de código.

Recomendar avaliar XML de NF-e modelo 55 fornecido pelo titular, inicialmente somente por fixtures artificiais. Alternativas: EFD-ICMS/IPI tem escopo por escrituração/competência; eSocial envolve dados pessoais e eventos trabalhistas; distribuição automática de NF-e acrescenta poderes, certificado, disponibilidade e limites remotos. São alternativas válidas, mas ampliam as dependências da primeira investigação. Esta comparação é julgamento de engenharia, não resultado de entrevistas ou homologação.

## Decisão desta entrega

Produzir [dossiê de fonte](../integrations/nfe-xml-assessment.md), [RFC 0004](../rfc/0004-nfe-xml-intake.md) e [matriz de testes](../engineering/nfe-xml-test-plan.md). Pesquisar documentação oficial pública, distinguir versão de leiaute de pacote XSD e registrar impedimentos observados. Não incorporar esquema ou nota fiscal ao repositório nesta etapa.

Critérios de aceite: fonte primária consultada e datada; fatos separados de hipóteses; escopo sem cálculo tributário; limites de parser/upload e autorização explícitos; negativos e sequência de TDD propostos; ausência de alegação de XSD, assinatura, autorização fiscal ou produção já validados. Verificar links internos, formato e coerência; documentação não exige testes artificiais de texto nem Red/Green retroativo.

## Riscos, evolução e reversão

MOC histórico isolado não comprova leiaute vigente: aquisição e fixação do pacote XSD, suas dependências/hash e notas técnicas aplicáveis são gate anterior ao parser. Documento parseado não prova assinatura ou situação fiscal; participante declarado no XML não prova autorização do usuário/tenant. Não reutilizar a comparação sintética como regra de NF-e.

Sem alteração de arquitetura executável, deploy, imports ou schema. Evolução sugerida: aprovação do recorte → aquisição/revisão dos schemas → parser puro com fixtures e TDD → autorização/isolamento e persistência em etapas próprias → transporte/UI → homologação autorizada. Processos distribuídos e coleta automática só após necessidade medida e direitos comprovados. Reversão remove a proposta sem afetar dados/runtime existentes.
