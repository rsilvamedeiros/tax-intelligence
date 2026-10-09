# Validação da consulta administrativa de membros

Escopo e aceite: [ADR 0013](../adr/0013-administrative-membership-directory.md).

## Plano

Registrar falhas por capacidade ausente antes de implementar cada fronteira. Executar contratos/serviço/HTTP, PostgreSQL isolado com runtime não proprietário, API compilada com RSA, regressões e checks estáticos. Publicar resultados reais e revisão remota antes de considerar a etapa pronta para aprovação humana.

## Evidências

Documentação e escopo em AGENTS registrados em commits antes dos testes/código.

| Fronteira  | Red observado                                                            | Green inicial |
| ---------- | ------------------------------------------------------------------------ | ------------- |
| Contrato   | Schema provisório never e OpenAPI vazio: 2 falhas, 5 negativos já passam | 7 testes      |
| Serviço    | Método provisório rejeita a capacidade ausente: 7 falhas                 | 7 testes      |
| HTTP       | Rota ausente retorna 404 e não publica operação: 15 falhas               | 15 testes     |
| PostgreSQL | Adapter provisório retorna negação: 4 falhas, 4 negativos já passam      | 8 testes      |

Primeira execução PostgreSQL excedeu timeout de 5s na preparação/limpeza da fixture durante outras verificações locais. Não é Red comportamental. Repetição isolada com os mesmos limites produziu o Red legítimo descrito acima; nenhum timeout ou assertion foi relaxado.

Teste adicional de leitura durante revogação não confirmada e integração com API compilada foram escritos após a implementação; são verificação complementar, não TDD retroativo. Regressões completas e revisão remota ainda pendentes.
