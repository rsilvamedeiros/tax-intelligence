export function exerciseSyntheticBatchBff(
  csrf: string,
  organizationId: string,
  otherOrganizationId: string,
) {
  return cy.window({ log: false }).then({ timeout: 20000 }, async (window) => {
    const path = `/api/organizations/${organizationId}/synthetic-document-batches`;
    const key = window.crypto.randomUUID();
    const input = {
      schemaVersion: 'synthetic-document-batch-v1',
      documents: [
        {
          reference: 'browser-sample',
          declaredTotalCents: 999,
          lineAmountsCents: [100],
        },
      ],
    };
    const headers = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrf,
      'Idempotency-Key': key,
    };
    const create = (body = input, override = {}) =>
      window.fetch(path, {
        method: 'POST',
        headers: { ...headers, ...override },
        body: JSON.stringify(body),
      });
    expect((await create(input, { 'x-csrf-token': 'wrong' })).status).to.equal(
      403,
    );
    const first = await create();
    expect(first.status).to.equal(201);
    expect(first.headers.get('cache-control')).to.equal('no-store');
    const receipt = (await first.json()) as { id: string };
    expect(Object.keys(receipt).sort()).to.deep.equal([
      'createdAt',
      'id',
      'schemaVersion',
    ]);
    const replay = await create();
    expect(replay.status).to.equal(200);
    expect(await replay.json()).to.deep.equal(receipt);
    expect(
      (
        await create({
          ...input,
          documents: [{ ...input.documents[0]!, declaredTotalCents: 100 }],
        })
      ).status,
    ).to.equal(409);
    const detail = await window.fetch(`${path}/${receipt.id}`);
    expect(detail.status).to.equal(200);
    expect(await detail.json()).to.deep.equal({
      ...receipt,
      documents: input.documents,
    });
    const other = `/api/organizations/${otherOrganizationId}/synthetic-document-batches`;
    expect((await window.fetch(`${other}/${receipt.id}`)).status).to.equal(403);
    expect(
      (
        await window.fetch(other, {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        })
      ).status,
    ).to.equal(403);
    const missing = await window.fetch(`${path}/${window.crypto.randomUUID()}`);
    expect(missing.status).to.equal(404);
    return receipt.id;
  });
}
