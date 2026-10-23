import { exerciseSyntheticBatchBff } from '../support/synthetic-batch';
import { exerciseSyntheticDiagnosticBff } from '../support/synthetic-diagnostic';
import {
  exerciseSyntheticDiagnosticUi,
  verifyReadOnlyDiagnosticUi,
} from '../support/synthetic-diagnostic-ui';
import {
  exerciseSyntheticBatchUi,
  verifyReadOnlyBatchUi,
} from '../support/synthetic-batch-ui';

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
      cy.env<{ organizationIds: string[]; actorIds: [string, string, string] }>(
        ['organizationIds', 'actorIds'],
        { log: false },
      ).then(({ organizationIds: ids, actorIds: actors }) => {
        expect(actors).to.have.length(3);
        exerciseSyntheticBatchUi();
        exerciseSyntheticDiagnosticUi();
        exerciseSyntheticBatchBff(body.csrfToken, ids[0]!, ids[2]!).as(
          'syntheticBatchId',
        );
        cy.get<string>('@syntheticBatchId').then((batchId) => {
          exerciseSyntheticDiagnosticBff(
            body.csrfToken,
            ids[0]!,
            ids[2]!,
            batchId,
          ).as('syntheticDiagnosticId');
        });
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
        cy.contains('li', 'Synthetic A').find('button').click();
        cy.contains('h3', 'Membros').should('be.visible');
        const grant = (actor: string, role: string) => {
          cy.get('form[aria-label="Conceder acesso"]').within(() => {
            cy.get('input').clear().type(actor, { log: false });
            cy.get('select').select(role);
            cy.contains('button', 'Conceder acesso').click();
          });
          cy.contains('.membership-list li', actor).should(
            'contain.text',
            'Ativo',
          );
        };
        grant(actors[1], 'viewer');
        mutate('PUT', member, 'viewer');
        cy.contains('.membership-list li', actors[1]).within(() => {
          cy.get('select').select('analyst');
          cy.contains('button', 'Salvar papel').click();
        });
        cy.contains('.membership-list li', actors[1])
          .find('p')
          .should('contain.text', 'Análise');
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
        cy.contains('.membership-list li', actors[1]).within(() => {
          cy.contains('button', 'Revogar acesso').click();
          cy.contains('button', 'Cancelar revogação')
            .should('have.focus')
            .click();
          cy.contains('button', 'Revogar acesso').should('have.focus').click();
          cy.contains('button', 'Confirmar revogação').click();
        });
        cy.contains('.membership-list li', actors[1])
          .should('contain.text', 'Revogado')
          .find('button')
          .should('not.exist');
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
        grant(actors[2], 'organization_admin');
        cy.contains('.membership-list li', actors[0]).within(() => {
          cy.get('select').select('viewer');
          cy.contains('button', 'Salvar papel').click();
        });
        cy.contains(
          'Administração indisponível. Selecione a organização novamente.',
        ).should('be.visible');
        cy.get('.membership-list').should('not.exist');
        cy.get('form[aria-label="Conceder acesso"]').should('not.exist');
        cy.request({ url: collection, failOnStatusCode: false, log: false })
          .its('status')
          .should('equal', 403);
        mutate('PATCH', `${collection}/${actors[2]}`, 'viewer', 403);
        const batches = `/api/organizations/${ids[0]}/synthetic-document-batches`;
        const diagnostics = `/api/organizations/${ids[0]}/synthetic-diagnostic-executions`;
        cy.get<string>('@syntheticDiagnosticId').then((id) => {
          cy.request({ url: `${diagnostics}/${id}`, log: false })
            .its('status')
            .should('equal', 200);
        });
        cy.get<string>('@syntheticBatchId').then((batchId) => {
          cy.request({
            method: 'POST',
            url: diagnostics,
            headers,
            body: { batchId },
            failOnStatusCode: false,
            log: false,
          })
            .its('status')
            .should('equal', 403);
        });
        cy.get<string>('@syntheticBatchId').then((id) => {
          cy.request({ url: `${batches}/${id}`, log: false })
            .its('status')
            .should('equal', 200);
        });
        cy.request({
          method: 'POST',
          url: batches,
          headers: {
            ...headers,
            'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
          },
          body: {
            schemaVersion: 'synthetic-document-batch-v1',
            documents: [
              {
                reference: 'denied-viewer',
                declaredTotalCents: 1,
                lineAmountsCents: [1],
              },
            ],
          },
          failOnStatusCode: false,
          log: false,
        })
          .its('status')
          .should('equal', 403);
        verifyReadOnlyBatchUi();
        verifyReadOnlyDiagnosticUi();
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
    cy.get('.synthetic-batch-panel').should('not.exist');
    cy.get('.synthetic-diagnostic-panel').should('not.exist');
    cy.env<{ organizationIds: string[] }>(['organizationIds'], {
      log: false,
    }).then(({ organizationIds: ids }) => {
      const path = `/api/organizations/${ids[0]}/synthetic-document-batches`;
      const diagnostics = `/api/organizations/${ids[0]}/synthetic-diagnostic-executions`;
      cy.request({
        method: 'POST',
        url: diagnostics,
        headers: { Origin: 'http://127.0.0.1:3000' },
        body: {},
        failOnStatusCode: false,
        log: false,
      })
        .its('status')
        .should('equal', 401);
      cy.get<string>('@syntheticDiagnosticId').then((id) => {
        cy.request({
          url: `${diagnostics}/${id}`,
          failOnStatusCode: false,
          log: false,
        })
          .its('status')
          .should('equal', 401);
      });
      cy.request({
        method: 'POST',
        url: path,
        headers: { Origin: 'http://127.0.0.1:3000' },
        body: {},
        failOnStatusCode: false,
        log: false,
      })
        .its('status')
        .should('equal', 401);
      cy.request({
        url: `${path}/00000000-0000-4000-8000-000000000001`,
        failOnStatusCode: false,
        log: false,
      })
        .its('status')
        .should('equal', 401);
    });
    cy.request({
      url: '/api/auth/session',
      failOnStatusCode: false,
      log: false,
    })
      .its('status')
      .should('equal', 401);
  });
});
