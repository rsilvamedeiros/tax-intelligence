# Frontend e design system

Next.js App Router, React e TypeScript strict. Server Components por padrão; Client Components somente para estado, eventos e APIs do navegador. Componentes não calculam regras fiscais; exibem resultados produzidos por casos de uso da API. A tela operacional usa um proxy server-side com timeout e validação runtime do contrato; não encaminha respostas desconhecidas.

Autenticação usa um BFF Node com OIDC code + PKCE S256. Tokens ficam no servidor, criptografados em PostgreSQL; cookies contêm identificadores opacos. A exceção de acesso a database é restrita ao módulo server-only de sessões, conforme [ADR 0007](../adr/0007-bff-session-storage.md). O navegador recebe somente identidade mínima e CSRF; logout revoga a sessão local. Membership, dados de negócio e refresh permanecem fora desta etapa.

`packages/ui` começa com composição visual mínima. Tokens CSS para cores, espaçamento, foco e tipografia; promover componentes a pacote compartilhado após uso real. Sem biblioteca visual adicional nesta fase. Formulários futuros devem associar label, descrição e mensagem de erro por ID; loading e status anunciam mudanças sem mover foco. Navegação por teclado, skip link, HTML semântico e contraste são critérios de revisão.

Estados necessários: loading anunciado, resultado válido, vazio, indisponibilidade, recuperação por botão e cancelamento em unmount. Testar pelo papel e texto percebidos pelo usuário com RTL; axe complementa inspeção manual por teclado e leitor de tela. Cypress valida a jornada com a API real e um cenário de falha controlada.

Vue/Vuetify são complementares para integrações ou produtos existentes de parceiros. Não adicionar segunda stack, Module Federation ou microfrontends ao MVP. [Critérios futuros](evolution.md).
