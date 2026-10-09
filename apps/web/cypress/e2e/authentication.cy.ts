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
