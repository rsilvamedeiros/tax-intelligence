export function exerciseSyntheticDiagnosticBff(
  csrf: string,
  organizationId: string,
  otherOrganizationId: string,
  batchId: string,
) {
  return cy.window({ log: false }).then({ timeout: 20000 }, async (window) => {
    const path = `/api/organizations/${organizationId}/synthetic-diagnostic-executions`;
    const headers = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
      Authorization: 'Bearer forged',
      'x-tenant-id': otherOrganizationId,
    };
    const create = (overrides = {}) =>
      window.fetch(path, {
        method: 'POST',
        headers: { ...headers, ...overrides },
        body: JSON.stringify({ batchId }),
      });
    expect((await create({ 'x-csrf-token': 'wrong' })).status).to.equal(403);
    expect(
      (await create({ 'Idempotency-Key': window.crypto.randomUUID() })).status,
    ).to.equal(400);
    const first = await create();
    expect(first.status).to.equal(201);
    expect(first.headers.get('cache-control')).to.equal('no-store');
    const receipt = (await first.json()) as { id: string; batchId: string };
    expect(receipt.batchId).to.equal(batchId);
    expect(Object.keys(receipt).sort()).to.deep.equal([
      'batchId',
      'createdAt',
      'id',
      'ruleId',
      'ruleVersion',
    ]);
    const replay = await create();
    expect(replay.status).to.equal(200);
    expect(await replay.json()).to.deep.equal(receipt);
    const response = await window.fetch(`${path}/${receipt.id}`);
    expect(response.status).to.equal(200);
    const detail = await response.json();
    expect(detail.id).to.equal(receipt.id);
    expect(detail.diagnostic.rule).to.deep.equal({
      id: 'DEMO-TOTAL-001',
      version: '1.0.0',
      source: 'project-fixture-specification',
      fiscalValidity: 'none',
    });
    expect(detail.diagnostic.documents[0].computedTotalCents).to.equal(100);
    expect(detail.diagnostic.documents[0].differenceCents).to.equal(899);
    const other = `/api/organizations/${otherOrganizationId}/synthetic-diagnostic-executions`;
    expect((await window.fetch(`${other}/${receipt.id}`)).status).to.equal(403);
    expect(
      (
        await window.fetch(other, {
          method: 'POST',
          headers,
          body: JSON.stringify({ batchId }),
        })
      ).status,
    ).to.equal(403);
    expect(
      (await window.fetch(`${path}/${window.crypto.randomUUID()}`)).status,
    ).to.equal(404);
    return receipt.id;
  });
}
