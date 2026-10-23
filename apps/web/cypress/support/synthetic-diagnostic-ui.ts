function diagnosticField(label: string, value: string) {
  return cy
    .contains('label', label)
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`).clear().type(value));
}
export function exerciseSyntheticDiagnosticUi() {
  cy.contains('button', 'Usar lote consultado no diagnóstico').click();
  cy.contains('label', 'Lote para diagnóstico')
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`).should('be.focused'));
  let attempt = 0;
  let command: unknown;
  cy.intercept(
    'POST',
    '/api/organizations/*/synthetic-diagnostic-executions',
    (request) => {
      const current = ++attempt;
      if (current <= 2) {
        expect(request.headers.authorization).to.equal(undefined);
        expect(request.headers['idempotency-key']).to.equal(undefined);
        expect(Object.keys(request.body)).to.deep.equal(['batchId']);
        if (current === 1) command = request.body;
        else expect(request.body).to.deep.equal(command);
      }
      request.on('before:response', (response) => {
        if (current === 1) {
          expect(response.statusCode).to.equal(201);
          // Preserve the committed API effect; replace only the browser-visible response.
          response.statusCode = 503;
          response.body = { message: 'Falha simulada após registro' };
        }
      });
    },
  ).as('uiDiagnosticCreate');
  cy.contains('label', 'Lote para diagnóstico')
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`).type('{enter}'));
  cy.wait('@uiDiagnosticCreate')
    .its('response.statusCode')
    .should('equal', 503);
  cy.contains('Não foi possível confirmar o diagnóstico.').should('be.visible');
  cy.contains('button', 'Executar diagnóstico').should('be.disabled');
  cy.contains('button', 'Repetir o mesmo diagnóstico').click();
  cy.wait('@uiDiagnosticCreate')
    .then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      return (response?.body as { id: string }).id;
    })
    .as('uiDiagnosticId', { type: 'static' });
  cy.contains('Diagnóstico recuperado.').should('be.visible');
  cy.contains('button', 'Consultar resultado').click();
  cy.get('section[aria-label="Resultado do diagnóstico"]').should(
    'contain.text',
    'Sem validade fiscal.',
  );
  cy.get('.diagnostic-evidence tbody tr').should('have.length', 2);
  cy.get('.diagnostic-evidence tbody tr')
    .first()
    .should('contain.text', 'browser-ui-a')
    .and('contain.text', '300')
    .and('contain.text', '699')
    .and('contain.text', 'Divergência demonstrativa');
  cy.get('.diagnostic-evidence tbody tr')
    .last()
    .should('contain.text', 'Totais correspondem');
  cy.viewport(390, 844);
  cy.get('.diagnostic-evidence')
    .should('have.attr', 'tabindex', '0')
    .focus()
    .should('be.focused')
    .then((element) => {
      expect(element[0]!.scrollWidth).to.be.greaterThan(
        element[0]!.clientWidth,
      );
    });
  cy.viewport(1280, 720);
  cy.contains('button', 'Preparar outro diagnóstico').click();
  cy.contains('label', 'Lote para diagnóstico')
    .invoke('attr', 'for')
    .then((id) =>
      cy.get(`[id="${id}"]`).should('have.value', '').and('be.focused'),
    );
  cy.contains('button', 'Atualizar organizações').click();
  cy.get('.synthetic-diagnostic-panel').should('not.exist');
  cy.contains('li', 'Synthetic A').find('button').click();
  cy.get('section[aria-label="Resultado do diagnóstico"]').should('not.exist');
  cy.get<string>('@uiDiagnosticId').then((id) =>
    diagnosticField('Identificador do diagnóstico', id).type('{enter}'),
  );
  cy.contains('Diagnóstico consultado.').should('be.visible');
}
export function verifyReadOnlyDiagnosticUi() {
  cy.get('form[aria-label="Executar diagnóstico sintético"]').should(
    'not.exist',
  );
  cy.get<string>('@uiDiagnosticId').then((id) =>
    diagnosticField('Identificador do diagnóstico', id).type('{enter}'),
  );
  cy.get('section[aria-label="Resultado do diagnóstico"]').should(
    'contain.text',
    'browser-ui-a',
  );
}
