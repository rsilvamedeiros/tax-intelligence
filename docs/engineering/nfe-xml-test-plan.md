# Plano de TDD — Candidata de leitura XML de NF-e

Data: 23/10/2026. Status: planejado, não executado. [RFC 0004](../rfc/0004-nfe-xml-intake.md); [gate da fonte](../integrations/nfe-xml-assessment.md). Não há parser, testes novos de aplicação ou evidência Red/Green nesta entrega documental.

## Prontidão

Aprovar recorte/modelo/envelope e perfil oficial; fixar pacote XSD/dependências/hash e notas técnicas aplicáveis. Criar fixtures artificiais identificadas como sem validade fiscal; nenhuma chave privada, nota real anonimizada ou exemplo com PII. Estabelecer limites e orçamento CPU/memória antes de expor qualquer upload. Testes de parser não homologam API, persistência ou regra fiscal.

| ID     | Comportamento observável proposto                                                                          | Fronteira / evidência esperada                           |
| ------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| NFE-01 | Fixture mínima no perfil aprovado preserva campos/precisão e marca verificações fiscais `not_checked`      | Parser real, schema fixado; sem mocks da biblioteca      |
| NFE-02 | Modelo/versão/envelope/namespace incompatíveis, múltiplas raízes ou documentos são rejeitados              | Fixtures negativas e prefixos equivalentes positivos     |
| NFE-03 | DTD, XXE, entidades paramétricas, schemaLocation remoto, XInclude e expansão não causam leitura externa    | Sentinelas locais de rede/disco; zero acessos observados |
| NFE-04 | Acima dos limites de bytes/profundidade/nós rejeita; limites aceitos não são truncados                     | Casos de fronteira e medição de CPU/memória              |
| NFE-05 | UTF-8 inválido, declaração divergente, XML incompleto e estruturas ambíguas rejeitam com código seguro     | Bytes reais; erro sem conteúdo ou nome do arquivo        |
| NFE-06 | Decimais e escala do campo são preservados; overflow ou escala incompatível não arredondam                 | Fronteiras monetárias derivadas do schema aprovado       |
| NFE-07 | Mesmo conteúdo dá hash dos bytes originais; alteração de bytes muda hash sem alegar nova identidade fiscal | Hash real; sem deduplicação entre tenants                |
| NFE-08 | Referências/protocolo incoerentes, ID duplicado e signature wrapping não escolhem conteúdo arbitrário      | Fixtures adversariais; nenhum sucesso de autenticidade   |
| NFE-09 | XML, chave, documento, participante e valores não aparecem em erro/log/trace                               | Sentinelas artificiais e whitelist de campos             |
| NFE-10 | Resultado estrutural não gera cálculo, parecer, status “autorizado” ou adaptação à regra DEMO-TOTAL-001    | Contrato de saída e consumidores reais, quando aprovados |
| NFE-11 | Novo pacote/leiaute não é aceito silenciosamente; regressões de perfil anterior permanecem reproduzíveis   | Perfis versionados, dependências e fixtures fixadas      |

Sequência: primeiro NFE-01 com Red comportamental válido → mínimo Green; depois incompatibilidades e segurança NFE-02/03/05/08; limites NFE-04; precisão/hash/privacidade NFE-06/07/09; contrato e evolução NFE-10/11. Não usar falha de import, ausência de schema ou ambiente quebrado como Red. Registro deve conter comando, falha esperada, Green real e limitações.

Banco, concorrência, papéis/tenant, retenção, upload, CSRF, assinatura criptográfica e consulta fiscal ficam em matrizes próprias antes de suas implementações. Nenhum mock substitui PostgreSQL real quando houver persistência. Negativos de autorização/tenant e auditoria serão bloqueantes nessa futura etapa.
