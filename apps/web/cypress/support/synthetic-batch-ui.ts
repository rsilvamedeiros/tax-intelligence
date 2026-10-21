function field(label: string, value: string) {
  return cy
    .contains('label', label)
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`).clear().type(value));
}
export function exerciseSyntheticBatchUi() {
  cy.contains('li', 'Synthetic A').find('button').click();
  cy.get('form[aria-label="Criar lote sintético"]').should('be.visible');
  field('Referência do documento 1', 'browser-ui-a');
  field('Total declarado em centavos do documento 1', '10000000000');
  field('Valores das linhas em centavos do documento 1', '100, 200');
  cy.contains('button', 'Criar lote sintético').click();
  cy.contains('[role="alert"]', 'Informe valores inteiros em centavos.').should(
    'be.visible',
  );
  field('Total declarado em centavos do documento 1', '999');
  cy.contains('button', 'Adicionar documento').click();
  field('Referência do documento 2', 'browser-ui-b');
  field('Total declarado em centavos do documento 2', '0');
  field('Valores das linhas em centavos do documento 2', '0');
  let attempt = 0;
  let firstKey: unknown;
  cy.intercept(
    'POST',
    '/api/organizations/*/synthetic-document-batches',
    (request) => {
      const current = ++attempt;
      if (current === 1) {
        firstKey = request.headers['idempotency-key'];
        expect(firstKey).to.match(/^[0-9a-f-]{36}$/i);
        expect(request.headers.authorization).to.equal(undefined);
      }
      if (current === 2)
        expect(request.headers['idempotency-key']).to.equal(firstKey);
      request.on('before:response', (response) => {
        if (current === 1) {
          expect(response.statusCode).to.equal(201);
          // The API committed; only the response observed by the browser is replaced.
          response.statusCode = 503;
          response.body = { message: 'Falha simulada após criação' };
        }
      });
    },
  ).as('uiBatchCreate');
  cy.contains('button', 'Criar lote sintético').click();
  cy.wait('@uiBatchCreate').its('response.statusCode').should('equal', 503);
  cy.contains('Não foi possível confirmar a criação.').should('be.visible');
  cy.contains('button', 'Criar lote sintético').should('be.disabled');
  cy.contains('button', 'Repetir a mesma criação').click();
  cy.wait('@uiBatchCreate')
    .then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      return (response?.body as { id: string }).id;
    })
    .as('uiBatchId', { type: 'static' });
  cy.get('section[aria-label="Recibo do lote"]').should('be.visible');
  cy.contains('button', 'Consultar lote').click();
  cy.get('section[aria-label="Detalhe do lote"]')
    .should('contain.text', 'browser-ui-a')
    .and('contain.text', 'browser-ui-b');
  cy.contains('button', 'Atualizar organizações').click();
  cy.get('.synthetic-batch-panel').should('not.exist');
  cy.contains('li', 'Synthetic A').find('button').click();
  cy.contains('label', 'Referência do documento 1')
    .invoke('attr', 'for')
    .then((id) => cy.get(`[id="${id}"]`).should('have.value', ''));
  cy.get('section[aria-label="Recibo do lote"]').should('not.exist');
  cy.get<string>('@uiBatchId').then((id) => field('Identificador do lote', id));
  cy.contains('button', 'Consultar lote').click();
  cy.get('section[aria-label="Detalhe do lote"]').should(
    'contain.text',
    'browser-ui-a',
  );
}
export function verifyReadOnlyBatchUi() {
  cy.contains('li', 'Synthetic A').find('button').click();
  cy.get('form[aria-label="Criar lote sintético"]').should('not.exist');
  cy.get<string>('@uiBatchId').then((id) => field('Identificador do lote', id));
  cy.contains('button', 'Consultar lote').click();
  cy.get('section[aria-label="Detalhe do lote"]').should(
    'contain.text',
    'browser-ui-a',
  );
}
