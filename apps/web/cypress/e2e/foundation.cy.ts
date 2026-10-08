describe('Foundation journey', () => {
  it('displays the live API readiness through the real frontend proxy', () => {
    cy.request('/api/health')
      .its('body')
      .should('include', { status: 'ok', service: 'tax-intelligence-api' });
    cy.visit('/');
    cy.get('h1').should('contain', 'Inteligência com rastreabilidade');
    cy.get('[role="status"]').should('contain', 'API disponível');
    cy.get('html').should('have.attr', 'lang', 'pt-BR');
  });
  it('recovers from an operational failure', () => {
    cy.intercept('GET', '/api/health', {
      statusCode: 503,
      body: { message: 'API indisponível' },
    }).as('unavailable');
    cy.visit('/');
    cy.wait('@unavailable');
    cy.get('[role="status"]').should('contain', 'API indisponível');
    cy.intercept('GET', '/api/health', {
      statusCode: 200,
      body: { status: 'ok', service: 'tax-intelligence-api' },
    }).as('healthy');
    cy.contains('section', 'Status da plataforma')
      .contains('button', 'Tentar novamente')
      .click();
    cy.wait('@healthy');
    cy.get('[role="status"]').should('contain', 'API disponível');
  });
});
