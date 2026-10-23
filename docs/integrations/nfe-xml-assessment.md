# Dossiê de fonte — XML de NF-e

Pesquisa pública: 23/10/2026. Status: candidata recomendada para revisão, sem implementação ou autorização para receber documentos reais. [Escopo](../adr/0029-nfe-source-discovery.md).

## Evidência oficial e limites da pesquisa

| Fonte primária                                                                                                         | Evidência consultada                                                                                                                               | Limite                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [CONFAZ, MOC 7.0, Anexo I](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf) | PDF de novembro/2020, 153 páginas. Grupo A, p. 8: infNFe/versao 4.00; grupo B identifica modelo 55. Grupos I/W descrevem valores de itens e totais | Base histórica; não substitui notas técnicas posteriores ou pacote XSD vigente                                                         |
| [SEFAZ Virtual RS, documentos de NF-e](https://dfe-portal.svrs.rs.gov.br/Nfe/Documentos)                               | Catálogo oficial consultado contém MOC 7.00, pacotes de schemas e notas técnicas, inclusive publicações de 2026                                    | Catálogo não comprova que um pacote listado seja o mais recente/aplicável; ZIPs não foram baixados ou homologados                      |
| [Portal Nacional, schemas](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D)       | Endereço oficial tentado nesta pesquisa                                                                                                            | Navegação retornou loop de redirecionamento. Não contornado por scraping, sessão ou CAPTCHA; acesso direto ao pacote continua pendente |

Manual 7.0 e leiaute 4.00 são identificadores diferentes. O pacote XSD e as notas técnicas aplicáveis ainda precisam de aquisição e revisão explícitas. Não declarar suporte integral à NF-e 4.00 com base somente nesse atributo.

O MOC distingue total de produtos e total da nota, com componentes e exceções (grupos I/W, p. 19 e 121–123). Portanto, `vNF` não deve alimentar `DEMO-TOTAL-001` como soma simples de itens. Essa conclusão limita a integração proposta; não implementa ou interpreta uma regra tributária vigente.

## Via de acesso recomendada para avaliação

Arquivo XML disponibilizado por representante autorizado, sem chamar SEFAZ, sem certificado na plataforma e sem buscar documentos por chave. Nesta entrega, somente documentação pública foi consultada. Endpoint, autenticação, retry e quota de serviço remoto: não aplicáveis à via manual proposta; nenhum web service foi testado. Não presumir direitos sobre documento por sua presença no disco, por CNPJ no XML ou por membership na plataforma.

Alternativas e custos são registrados no ADR 0029. NF-e é recomendação técnica para reduzir dependência de uma integração remota na investigação inicial; benefício de negócio e representatividade ainda precisam de validação pelo responsável fiscal.

## Gate de prontidão para o próximo recorte

Antes de implementar parser, aprovar modelo/envelope e competência/ambiente de referência; obter pacote oficial XSD e dependências, fixar nomes, versão, origem, hash e licença/condições de redistribuição; relacionar notas técnicas e suas datas aplicáveis. Sem isso, o parser permanece proposto, não homologado. Não preencher hash ou versão por suposição.

Antes de dados reais, definir titular/poderes, finalidade/base legal, retenção, responsáveis, isolamento, criptografia e descarte. Chave de acesso, identificadores de participantes, endereço, produtos e XML bruto devem ser tratados como conteúdo restrito; sem logs, traces, URLs, exemplos públicos ou prompts. Fixture deve ser integralmente artificial, sem certificado privado ou documento real anonimizado.

Assinatura digital, cadeia de confiança, protocolo declarado e situação fiscal atual exigem evidências distintas. Presença de protNFe/cStat no arquivo não autentica seu conteúdo nem consulta cancelamento/eventos posteriores. Um futuro parser estrutural deve declarar essas verificações como não executadas; nunca apresentar “nota autorizada” ou “documento fiscal válido”.
