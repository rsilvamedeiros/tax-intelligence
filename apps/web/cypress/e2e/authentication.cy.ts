describe('Real Keycloak BFF login', () => {
  it('logs in through code and PKCE, enforces CSRF, and revokes the session', () => {
    cy.request({ url: '/', log: false })
      .its('headers.x-frame-options')
      .should('equal', 'DENY');
    cy.intercept(
      'GET',
      'http://127.0.0.1:3000/api/auth/callback*',
      (request) => {
        request.on('before:response', (response) => {
          expect(
            response.statusCode,
            'BFF callback redirects after login',
          ).to.equal(303);
          expect(response.headers.location).to.equal('http://127.0.0.1:3000/');
        });
      },
    );
    cy.visit('/');
    cy.task('authCheckpoint', 'app_loaded', { log: false });
    cy.contains('a', 'Entrar').click();
    cy.origin('http://127.0.0.1:8080', () => {
      cy.task('authCheckpoint', 'provider_ready', { log: false });
      cy.env<{ authUser: string; authPassword: string }>(
        ['authUser', 'authPassword'],
        { log: false },
      ).then(({ authUser: username, authPassword: password }) => {
        cy.task('authCheckpoint', 'credentials_ready', { log: false });
        cy.get('#username').type(username, { log: false });
        cy.task('authCheckpoint', 'username_entered', { log: false });
        cy.get('#password').type(password, { log: false });
        cy.task('authCheckpoint', 'credentials_entered', { log: false });
        cy.get('#kc-login').click();
      });
    });
    cy.contains('Você está conectado').should('be.visible');
    cy.task('authCheckpoint', 'session_active', { log: false });
    cy.contains('button', 'Selecionar').should('be.visible');
    cy.contains('strong', 'Synthetic A').should('be.visible');
    cy.contains('strong', 'Synthetic B').should('not.exist');
    cy.contains('li', 'Synthetic A').find('button').click();
    cy.contains('Organização selecionada: Synthetic A').should('be.visible');
    cy.env<{ organizationIds: string[] }>(['organizationIds'], {
      log: false,
    }).then(({ organizationIds: ids }) => {
      cy.request({ url: '/api/organizations?limit=1', log: false }).then(
        ({ body }) => {
          expect(body.items).to.have.length(1);
          expect(body.nextCursor).to.equal(ids[0]);
        },
      );
      cy.request({
        url: `/api/organizations/${ids[2]}/context`,
        failOnStatusCode: false,
        log: false,
      })
        .its('status')
        .should('equal', 403);
      cy.task('revokeMembership', ids[1], { log: false });
      cy.contains('li', 'Synthetic Revoked').find('button').click();
      cy.contains('Acesso a esta organização indisponível').should(
        'be.visible',
      );
      cy.contains('Organização selecionada:').should('not.exist');
      cy.request({
        url: `/api/organizations/${ids[1]}/context`,
        failOnStatusCode: false,
        log: false,
      })
        .its('status')
        .should('equal', 403);
    });
    cy.getCookie('tax_session', { log: false }).then((cookie) => {
      expect(cookie?.httpOnly).to.equal(true);
      expect(cookie?.value).to.match(/^[A-Za-z0-9_-]{43}$/);
    });
    cy.request({ url: '/api/auth/session', log: false }).then(({ body }) => {
      expect(Object.keys(body).sort()).to.deep.equal([
        'authenticated',
        'csrfToken',
        'identity',
      ]);
      expect(body.identity.issuer).to.equal(
        'http://127.0.0.1:8080/realms/tax-intelligence',
      );
      cy.env<{ organizationIds: string[]; actorIds: string[] }>(
        ['organizationIds', 'actorIds'],
        { log: false },
      ).then(({ organizationIds: ids, actorIds: actors }) => {
        const collection = `/api/organizations/${ids[0]}/memberships`;
        const member = `${collection}/${actors[1]}`;
        const headers = {
          Origin: 'http://127.0.0.1:3000',
          'x-csrf-token': body.csrfToken,
        };
        const mutate = (
          method: 'PUT' | 'PATCH' | 'DELETE',
          url: string,
          role?: string,
          expected = 204,
        ) =>
          cy
            .request({
              method,
              url,
              headers,
              ...(role === undefined ? {} : { body: { role } }),
              failOnStatusCode: false,
              log: false,
            })
            .its('status')
            .should('equal', expected);
        cy.request({ url: collection, log: false }).then(
          ({ body: page, headers: responseHeaders }) => {
            expect(page).to.deep.equal({
              items: [
                {
                  actorId: actors[0],
                  role: 'organization_admin',
                  status: 'active',
                },
              ],
              nextCursor: null,
            });
            expect(responseHeaders['cache-control']).to.equal('no-store');
          },
        );
        cy.request({
          method: 'PUT',
          url: member,
          headers: { ...headers, 'x-csrf-token': 'wrong' },
          body: { role: 'viewer' },
          failOnStatusCode: false,
          log: false,
        })
          .its('status')
          .should('equal', 403);
        cy.request({
          method: 'DELETE',
          url: member,
          headers: { ...headers, Origin: 'https://attacker.invalid' },
          failOnStatusCode: false,
          log: false,
        })
          .its('status')
          .should('equal', 403);
        cy.request({
          url: `/api/organizations/${ids[2]}/memberships`,
          failOnStatusCode: false,
          log: false,
        })
          .its('status')
          .should('equal', 403);
        mutate(
          'PUT',
          `/api/organizations/${ids[2]}/memberships/${actors[0]}`,
          'viewer',
          403,
        );
        mutate('PUT', member, 'viewer');
        mutate('PUT', member, 'viewer');
        mutate('PATCH', member, 'analyst');
        cy.request({ url: collection, log: false }).then(({ body: page }) => {
          expect(page.items).to.have.length(2);
          expect(
            page.items.find(
              (entry: { actorId: string }) => entry.actorId === actors[1],
            ),
          ).to.deep.equal({
            actorId: actors[1],
            role: 'analyst',
            status: 'active',
          });
        });
        cy.request({ url: collection + '?limit=1', log: false }).then(
          ({ body: page }) => {
            expect(page.items).to.have.length(1);
            expect(page.nextCursor).to.equal(page.items[0].actorId);
            cy.request({
              url: `${collection}?limit=1&cursor=${page.nextCursor}`,
              log: false,
            }).then(({ body: next }) => {
              expect(next.items).to.have.length(1);
              expect(next.nextCursor).to.equal(null);
            });
          },
        );
        mutate('DELETE', member);
        mutate('DELETE', member);
        mutate('PUT', member, 'viewer', 409);
        cy.request({ url: collection, log: false }).then(({ body: page }) => {
          expect(
            page.items.find(
              (entry: { actorId: string }) => entry.actorId === actors[1],
            ),
          ).to.deep.equal({
            actorId: actors[1],
            role: 'analyst',
            status: 'revoked',
          });
        });
        mutate('PUT', `${collection}/${actors[2]}`, 'organization_admin');
        mutate('PATCH', `${collection}/${actors[0]}`, 'viewer');
        cy.request({ url: collection, failOnStatusCode: false, log: false })
          .its('status')
          .should('equal', 403);
        mutate('PATCH', `${collection}/${actors[2]}`, 'viewer', 403);
      });
    });
    cy.request({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Origin: 'http://127.0.0.1:3000', 'x-csrf-token': 'wrong' },
      failOnStatusCode: false,
      log: false,
    })
      .its('status')
      .should('equal', 403);
    cy.request({ url: '/api/auth/session', log: false })
      .its('status')
      .should('equal', 200);
    cy.contains('button', 'Sair').click();
    cy.contains('a', 'Entrar').should('be.visible');
    cy.contains('strong', 'Synthetic A').should('not.exist');
    cy.request({
      url: '/api/organizations',
      failOnStatusCode: false,
      log: false,
    })
      .its('status')
      .should('equal', 401);
    cy.getCookie('tax_session', { log: false }).should('be.null');
    cy.request({
      url: '/api/auth/session',
      failOnStatusCode: false,
      log: false,
    })
      .its('status')
      .should('equal', 401);
  });
});
