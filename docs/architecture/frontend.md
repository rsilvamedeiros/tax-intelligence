# Frontend e design system

Next.js App Router, React e TypeScript strict. Server Components por padrão; Client Components somente para estado, eventos e APIs do navegador. Componentes não calculam regras fiscais; exibem resultados produzidos por casos de uso da API. A tela operacional usa um proxy server-side com timeout e validação runtime do contrato; não encaminha respostas desconhecidas.

Autenticação usa um BFF Node com OIDC code + PKCE S256. Tokens ficam no servidor, criptografados em PostgreSQL; cookies contêm identificadores opacos. A exceção de acesso a database permanece restrita a auth/runtime.ts, conforme [ADR 0007](../adr/0007-bff-session-storage.md). Esse runtime compõe a consulta de organizações com uma porta de sessão; a web não lê tabelas de membership. Navegador recebe identidade mínima, CSRF e schemas públicos de organização/contexto. Logout revoga a sessão local.

Após login, AccessPanel compõe a conta e OrganizationPanel. Listagem paginada usa o BFF; selecionar chama contexto novamente na API. Uma listagem anterior não concede acesso. Seleção existe somente no componente: atualizar lista, mudar página, retomar foco/visibilidade, substituir sessão ou iniciar logout limpa seleção e cancela respostas pendentes. CSRF identifica a instância de sessão para desmontar os dados anteriores; token nunca participa da UI. Sessão rejeitada pela API invalida a fronteira visual de conta. Administração, RLS, ações de negócio e refresh continuam pendentes. [ADR 0009](../adr/0009-browser-organization-selection.md).

Route Handlers usam params assíncronos e runtime Node explícito, conforme [documentação oficial do Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/route). GETs de organizações usam no-store e não persistem seleção; não há mutação de vínculo ou cookie de tenant.

`packages/ui` começa com composição visual mínima. Tokens CSS para cores, espaçamento, foco e tipografia; promover componentes a pacote compartilhado após uso real. Sem biblioteca visual adicional nesta fase. Formulários futuros devem associar label, descrição e mensagem de erro por ID; loading e status anunciam mudanças sem mover foco. Navegação por teclado, skip link, HTML semântico e contraste são critérios de revisão.

Estados necessários: loading anunciado, resultado válido, vazio, indisponibilidade, recuperação por botão e cancelamento em unmount. Testar pelo papel e texto percebidos pelo usuário com RTL; axe complementa inspeção manual por teclado e leitor de tela. Cypress valida a jornada com a API real e um cenário de falha controlada.

Vue/Vuetify são complementares para integrações ou produtos existentes de parceiros. Não adicionar segunda stack, Module Federation ou microfrontends ao MVP. [Critérios futuros](evolution.md).
