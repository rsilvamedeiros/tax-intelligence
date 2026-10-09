# Validação da consulta de memberships

Escopo autorizado no [ADR 0008](../adr/0008-membership-directory.md): resolução de ator e consultas autenticadas de organizações/membership. Implementação e checks ainda pendentes no início desta etapa.

Aceite: negativos de seleção cruzada, identidade por issuer/subject, revogação após commit, paginação limitada, indisponibilidade sanitizada e runtime sem escrita. Provar adapters com PostgreSQL real e integração do processo compilado com token assinado. Registrar Reds válidos e resultados efetivamente executados antes de declarar a entrega concluída.

RLS, administração com auditoria/locks e seleção BFF/UI não pertencem a esta entrega. Nenhuma evidência desta etapa demonstra isolamento de dados de negócio ainda inexistentes.
