import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const url = process.env.TEST_DATABASE_URL;
assert.ok(
  url && new URL(url).pathname.endsWith('_test'),
  'Isolated TEST_DATABASE_URL ending in _test required',
);
const requireDatabase = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const {
  createDatabase,
  SyntheticDiagnosticExecutionStore,
  SyntheticDocumentBatchStore,
} = requireDatabase('./dist/index.js');
const { SyntheticDiagnosticExecutionService } = requireApi(
  './dist/tax-intelligence/application/synthetic-diagnostic-execution.js',
);
const { migrate } = requireDatabase('drizzle-orm/node-postgres/migrator');
const owner = createDatabase(url);
const suffix = randomBytes(8).toString('hex');
const role = `diagnostic_compiled_${suffix}`;
const orgs = [randomUUID(), randomUUID()];
const actors = [randomUUID(), randomUUID(), randomUUID()];
const issuer = `https://${orgs[0]}.example.invalid`;
const identity = { issuer, subject: actors[0] };
const requestId = randomUUID();
const input = {
  schemaVersion: 'synthetic-document-batch-v1',
  documents: [
    {
      reference: 'compiled-demo',
      declaredTotalCents: 999,
      lineAmountsCents: [100, 200],
    },
  ],
};
const trigger = `diagnostic_failure_${suffix}`;
let runtime;
let roleCreated = false;
let triggerCreated = false;
let functionCreated = false;
try {
  await migrate(owner.db, {
    migrationsFolder: resolve('packages/database/migrations'),
  });
  const password = randomBytes(32).toString('hex');
  await owner.pool.query(
    `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`,
  );
  roleCreated = true;
  await owner.pool.query(
    `GRANT USAGE ON SCHEMA identity_access,organization_access,fiscal_compliance,tax_intelligence,audit_compliance TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT ON identity_access.actors,organization_access.memberships,fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT,INSERT ON tax_intelligence.synthetic_diagnostic_runs TO ${role}`,
  );
  await owner.pool.query(
    `GRANT INSERT(tenant_id,actor_id,execution_id,request_id) ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
  );
  const connection = new URL(url);
  connection.username = role;
  connection.password = password;
  runtime = createDatabase(connection.href);
  for (const id of orgs)
    await owner.pool.query(
      'INSERT INTO organization_access.organizations VALUES($1,$2)',
      [id, 'Synthetic compiled diagnostic'],
    );
  for (const id of actors)
    await owner.pool.query(
      'INSERT INTO identity_access.actors VALUES($1,$2,$3)',
      [id, issuer, id],
    );
  for (const [index, id] of actors.entries())
    await owner.pool.query(
      'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
      [
        index === 1 ? orgs[1] : orgs[0],
        id,
        index === 2 ? 'viewer' : 'organization_admin',
      ],
    );
  const batch = await new SyntheticDocumentBatchStore(owner.pool).create({
    identity,
    organizationId: orgs[0],
    input,
    idempotencyKey: randomUUID(),
    requestId,
  });
  assert.equal(batch.status, 'created');
  const batchId = batch.receipt.id;
  const service = new SyntheticDiagnosticExecutionService(
    new SyntheticDiagnosticExecutionStore(runtime.pool),
  );
  const command = { organizationId: orgs[0], batchId, requestId };
  const concurrent = await Promise.all([
    service.create(identity, command),
    service.create(identity, { ...command, requestId: randomUUID() }),
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort(), [
    'created',
    'replayed',
  ]);
  assert.deepEqual(concurrent[0].receipt, concurrent[1].receipt);
  const receipt = concurrent[0].receipt;
  const detail = await service.get(identity, {
    organizationId: orgs[0],
    executionId: receipt.id,
  });
  assert.equal(detail.status, 'found');
  assert.equal(
    detail.execution.diagnostic.documents[0].computedTotalCents,
    300,
  );
  assert.equal(detail.execution.diagnostic.documents[0].differenceCents, 699);
  const count = await owner.pool.query(
    'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
    [orgs[0]],
  );
  assert.equal(count.rows[0].count, 1);
  const viewer = { issuer, subject: actors[2] };
  assert.equal(
    (
      await service.get(viewer, {
        organizationId: orgs[0],
        executionId: receipt.id,
      })
    ).status,
    'found',
  );
  assert.equal((await service.create(viewer, command)).status, 'denied');
  const outsider = { issuer, subject: actors[1] };
  assert.equal(
    (
      await service.get(outsider, {
        organizationId: orgs[0],
        executionId: receipt.id,
      })
    ).status,
    'denied',
  );
  assert.equal(
    (
      await service.get(outsider, {
        organizationId: orgs[1],
        executionId: receipt.id,
      })
    ).status,
    'not_found',
  );
  assert.equal(
    (await service.create(identity, { ...command, batchId: randomUUID() }))
      .status,
    'not_found',
  );
  await owner.pool.query(
    "UPDATE tax_intelligence.synthetic_diagnostic_runs SET result=jsonb_set(result,'{documents,0,differenceCents}','1') WHERE tenant_id=$1 AND id=$2",
    [orgs[0], receipt.id],
  );
  await assert.rejects(
    service.get(identity, { organizationId: orgs[0], executionId: receipt.id }),
    /Invalid synthetic diagnostic state/,
  );
  await assert.rejects(
    service.create(identity, command),
    /Invalid synthetic diagnostic state/,
  );
  await owner.pool.query(
    'UPDATE tax_intelligence.synthetic_diagnostic_runs SET result=$3 WHERE tenant_id=$1 AND id=$2',
    [orgs[0], receipt.id, detail.execution.diagnostic],
  );
  const next = await new SyntheticDocumentBatchStore(owner.pool).create({
    identity,
    organizationId: orgs[0],
    input,
    idempotencyKey: randomUUID(),
    requestId: randomUUID(),
  });
  assert.equal(next.status, 'created');
  await owner.pool.query(
    `CREATE FUNCTION audit_compliance.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${orgs[0]}'::uuid THEN RAISE EXCEPTION 'Synthetic diagnostic audit failure'; END IF; RETURN NEW; END $$`,
  );
  functionCreated = true;
  await owner.pool.query(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_compliance.synthetic_diagnostic_creations FOR EACH ROW EXECUTE FUNCTION audit_compliance.${trigger}()`,
  );
  triggerCreated = true;
  await assert.rejects(
    service.create(identity, { ...command, batchId: next.receipt.id }),
    /Synthetic diagnostic audit failure/,
  );
  assert.equal(
    (
      await owner.pool.query(
        'SELECT count(*)::integer AS count FROM tax_intelligence.synthetic_diagnostic_runs WHERE tenant_id=$1 AND batch_id=$2',
        [orgs[0], next.receipt.id],
      )
    ).rows[0].count,
    0,
  );
  await owner.pool.query(
    `DROP TRIGGER ${trigger} ON audit_compliance.synthetic_diagnostic_creations`,
  );
  triggerCreated = false;
  await owner.pool.query(`DROP FUNCTION audit_compliance.${trigger}()`);
  functionCreated = false;
  assert.equal(
    (await service.create(identity, { ...command, batchId: next.receipt.id }))
      .status,
    'created',
  );
  await owner.pool.query(
    'UPDATE organization_access.memberships SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND actor_id=$2',
    [orgs[0], actors[0]],
  );
  assert.equal(
    (
      await service.get(identity, {
        organizationId: orgs[0],
        executionId: receipt.id,
      })
    ).status,
    'denied',
  );
  assert.equal((await service.create(identity, command)).status, 'denied');
  console.log(
    'Synthetic diagnostic integration passed: compiled service, real restricted PostgreSQL, concurrent natural replay, evidence integrity, tenant/role denial, audit rollback and revocation.',
  );
} finally {
  try {
    await runtime?.pool.end();
    if (triggerCreated)
      await owner.pool.query(
        `DROP TRIGGER ${trigger} ON audit_compliance.synthetic_diagnostic_creations`,
      );
    if (functionCreated)
      await owner.pool.query(`DROP FUNCTION audit_compliance.${trigger}()`);
    for (const table of [
      'audit_compliance.synthetic_diagnostic_creations',
      'tax_intelligence.synthetic_diagnostic_runs',
      'fiscal_compliance.synthetic_lines',
      'fiscal_compliance.synthetic_documents',
      'audit_compliance.synthetic_batch_creations',
      'fiscal_compliance.synthetic_batches',
    ])
      await owner.pool.query(
        `DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,
        [orgs],
      );
    await owner.pool.query(
      'DELETE FROM organization_access.memberships WHERE organization_id=ANY($1::uuid[])',
      [orgs],
    );
    await owner.pool.query(
      'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
      [orgs],
    );
    await owner.pool.query(
      'DELETE FROM identity_access.actors WHERE id=ANY($1::uuid[])',
      [actors],
    );
    if (roleCreated) {
      await owner.pool.query(`DROP OWNED BY ${role}`);
      await owner.pool.query(`DROP ROLE ${role}`);
    }
  } finally {
    await owner.pool.end();
  }
}
