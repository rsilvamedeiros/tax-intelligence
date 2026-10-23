# RFC 0004 — Leitura estrutural de XML de NF-e

Data: 23/10/2026. Status: proposta para revisão; não autoriza implementação, dados reais ou nova permissão. [ADR 0029](../adr/0029-nfe-source-discovery.md), [fonte e impedimentos](../integrations/nfe-xml-assessment.md).

## Objetivo e primeiro recorte proposto

Investigar um parser puro de bytes XML sintéticos de NF-e modelo 55, leiaute 4.00, envelope nfeProc com uma NFe e protocolo correspondente. Envelope, namespace e constraints devem ser confirmados no pacote oficial fixado antes do código. Não aceitar outros modelos, múltiplos documentos, resumos, eventos ou arquivos comprimidos nesse primeiro recorte. Não transformar a RFC em contrato REST aprovado.

Porta proposta no contexto Fiscal recebe bytes e identificador do perfil de schema previamente aprovado; retorna resultado estrutural ou códigos de rejeição estáveis. Domain/application independentes de biblioteca XML, Nest e ORM. Biblioteca fica em adapter; não criar pacote/contexto/microsserviço sem consumidor real. Seleção da biblioteca exige prova de limites e resolução externa desabilitada, sem adicionar dependência nesta entrega.

Saída mínima candidata: versão do parser/perfil, SHA-256 dos bytes originais, modelo/ambiente declarados, referência documental restrita e campos monetários declarados explicitamente nomeados. Não retornar árvore XML, dados cadastrais ou texto livre sem consumidor justificado. Assinatura, autenticidade, autorização e situação atual devem constar como `not_checked`. Hash não prova autenticidade nem é identificador público de consulta.

Não realizar aritmética tributária, inferir créditos, corrigir documento ou conectar essa saída à regra sintética. Eventual regra fiscal tem fonte, vigência, jurisdição e revisão especializada próprias. Valores decimais devem preservar precisão lexical e escala do campo; sem Number/float para conversão ou cálculo monetário. Se houver centavos inteiros no contrato futuro, rejeitar escala/overflow não representáveis sem arredondamento implícito.

## Segurança e limites candidatos

Valores abaixo são limites internos propostos para benchmark, não limites oficiais da NF-e: um arquivo de até 1 MiB, profundidade até 64 e até 100 mil nós. Limitar bytes antes de decodificar e durante leitura; UTF-8 estrito, declaração de encoding coerente, rejeitar truncamento/múltiplas raízes. Confirmar no XSD fixado como tratar conteúdo opcional e extensões; não rejeitar campos oficiais suportados por desconhecimento nem ignorar extensão arbitrária silenciosamente.

Rejeitar DOCTYPE, DTD, entidades gerais/paramétricas e referências externas; não realizar acesso a rede/disco, XInclude ou resolução dinâmica de schemaLocation. Imports/includes XSD devem vir exclusivamente do pacote local revisado, com resolução fechada. Cobrir namespaces/prefixos equivalentes e tentativas de namespace spoofing, duplicação de identificador, ambiguidade de envelope e signature wrapping. Não confiar em busca global pelo primeiro nome de tag.

O primeiro parser não será exposto a requisição. Antes de upload, medir CPU/memória e definir limite de tempo com cancelamento/interrupção comprovados; timeout de Promise não interrompe parser síncrono. Se necessário, usar isolamento de execução após medição, sem antecipar worker de negócio. Erros/logs: códigos limitados e localização sanitizada; nunca conteúdo de XML, nome de arquivo, chave, hash ou identificação de participante.

## Etapas posteriores, condicionadas

Tenant vem de membership revalidada; dados declarados no XML não escolhem tenant nem comprovam vínculo com contribuinte. Antes de persistir, definir relação autorizada organização/contribuinte e política de documento de terceiro. Nenhum uso dos pools, tabelas sintéticas ou RLS existente será ampliado por esta RFC.

Persistência futura exige schema/constraints/RLS próprios, auditoria atômica, proteção do bruto e retenção. Idempotência precisa distinguir bytes iguais de documento semanticamente igual: whitespace/serialização pode mudar hash; mesma chave com bytes diferentes exige política explícita, sem sobrescrita silenciosa ou deduplicação entre tenants. API, BFF, upload e UI terão contrato/ameaças/testes em etapas separadas.

## Aceite e rollout propostos

[Matriz de testes](../engineering/nfe-xml-test-plan.md) orienta Red/Green somente após aprovação do recorte e fixação dos schemas. Gate: nenhuma capacidade de leitura externa; limites mensuráveis; preservação de precisão; códigos seguros; indicação de verificações não executadas. Primeiro usar apenas fixture artificial. Homologação fiscal/operacional, dados reais e automação remota exigem decisões posteriores. Reversão do parser futuro deve remover consumidor sem alterar a vertical sintética integrada.
