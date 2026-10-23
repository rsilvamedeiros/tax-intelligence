'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  organizationIdSchema,
  syntheticDiagnosticExecutionReceiptSchema,
  syntheticDiagnosticExecutionDetailSchema,
} from '@tax/contracts';
import {
  SyntheticBatchPanel,
  type BatchPanelProps,
} from './synthetic-batch-panel';
type DiagnosticProps = BatchPanelProps & {
  initialBatchId?: string;
  onReferenceLock?: (locked: boolean) => void;
};
type Receipt = ReturnType<
  typeof syntheticDiagnosticExecutionReceiptSchema.parse
>;
type Detail = ReturnType<typeof syntheticDiagnosticExecutionDetailSchema.parse>;
export function SyntheticDocumentWorkspace(props: BatchPanelProps) {
  return (
    <DocumentWorkspace
      key={`${props.organizationId}:${props.csrfToken}:${props.role}`}
      {...props}
    />
  );
}
function DocumentWorkspace(props: BatchPanelProps) {
  const [selection, setSelection] = useState({ batchId: '', revision: 0 });
  const [locked, setLocked] = useState(false);
  const referenceLocked = useRef(false);
  const [denied, setDenied] = useState(false);
  function lockReference(value: boolean) {
    referenceLocked.current = value;
    setLocked(value);
  }
  function useBatch(batchId: string) {
    if (!referenceLocked.current)
      setSelection((current) => ({ batchId, revision: current.revision + 1 }));
  }
  function rejectAccess() {
    setDenied(true);
    props.onAccessDenied?.();
  }
  if (denied)
    return (
      <p role="alert" tabIndex={-1} ref={(node) => node?.focus()}>
        Acesso indisponível. Selecione a organização novamente.
      </p>
    );
  return (
    <>
      <SyntheticBatchPanel
        {...props}
        onUseBatch={locked ? undefined : useBatch}
        onAccessDenied={rejectAccess}
      />
      <SyntheticDiagnosticPanel
        key={selection.revision}
        {...props}
        initialBatchId={selection.batchId}
        onReferenceLock={lockReference}
        onAccessDenied={rejectAccess}
      />
    </>
  );
}
export function SyntheticDiagnosticPanel(props: DiagnosticProps) {
  return (
    <DiagnosticWorkspace
      key={`${props.organizationId}:${props.csrfToken}:${props.role}:${props.initialBatchId ?? ''}`}
      {...props}
    />
  );
}
function DiagnosticWorkspace({
  organizationId,
  csrfToken,
  role,
  initialBatchId = '',
  onSessionExpired,
  onAccessDenied,
  onReferenceLock,
}: DiagnosticProps) {
  const id = useId();
  const [batchId, setBatchId] = useState(initialBatchId);
  const [lookup, setLookup] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [busy, setBusy] = useState<'create' | 'lookup' | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [denied, setDenied] = useState(false);
  const [replayed, setReplayed] = useState(false);
  const intention = useRef<{ batchId: string; body: string } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const batchInput = useRef<HTMLInputElement | null>(null);
  const focusBatch = useRef(false);
  const canCreate = role === 'organization_admin' || role === 'analyst';
  const frozen = busy !== null || uncertain || receipt !== null;
  const path = `/api/organizations/${organizationId}/synthetic-diagnostic-executions`;
  useEffect(() => {
    if (initialBatchId) batchInput.current?.focus();
    return () => pending.current?.abort();
  }, [initialBatchId]);
  useEffect(() => {
    if (focusBatch.current) {
      batchInput.current?.focus();
      focusBatch.current = false;
    }
  }, [receipt]);
  function rejectAccess(status: number) {
    if (status !== 401 && status !== 403) return false;
    intention.current = null;
    setBatchId('');
    setLookup('');
    setReceipt(null);
    setDetail(null);
    setLookupMessage('');
    setUncertain(false);
    setDenied(true);
    setMessage(
      status === 401
        ? 'Sessão encerrada. Entre novamente.'
        : 'Acesso indisponível. Selecione a organização novamente.',
    );
    if (status === 401) onSessionExpired();
    else onAccessDenied?.();
    return true;
  }
  async function create(recover = false) {
    if (
      !canCreate ||
      denied ||
      receipt ||
      pending.current ||
      (uncertain && !recover)
    )
      return;
    if (!intention.current) {
      const parsed = organizationIdSchema.safeParse(batchId.trim());
      if (!parsed.success) {
        setMessage('Informe um identificador de lote válido.');
        return;
      }
      const selected = parsed.data.toLowerCase();
      intention.current = {
        batchId: selected,
        body: JSON.stringify({ batchId: selected }),
      };
    }
    const command = intention.current;
    const abort = new AbortController();
    pending.current = abort;
    setBusy('create');
    onReferenceLock?.(true);
    let keepReference = true;
    setMessage('');
    setDetail(null);
    setLookupMessage('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        cache: 'no-store',
        signal: abort.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: command.body,
      });
      if (abort.signal.aborted) return;
      if (rejectAccess(response.status)) {
        keepReference = false;
        return;
      }
      if ([400, 404, 413, 415].includes(response.status)) {
        keepReference = false;
        intention.current = null;
        setUncertain(false);
        setMessage(
          response.status === 404
            ? 'Lote não encontrado nesta organização.'
            : 'Referência rejeitada. Revise o identificador do lote.',
        );
        return;
      }
      if (response.status !== 200 && response.status !== 201)
        throw new Error('Creation unavailable');
      const data = syntheticDiagnosticExecutionReceiptSchema.parse(
        await response.json(),
      );
      if (abort.signal.aborted) return;
      if (data.batchId !== command.batchId) throw new Error('Batch mismatch');
      setReceipt(data);
      setLookup(data.id);
      setReplayed(response.status === 200);
      setUncertain(false);
      intention.current = null;
      keepReference = false;
    } catch {
      if (!abort.signal.aborted) {
        setMessage('Não foi possível confirmar o diagnóstico.');
        setUncertain(true);
      }
    } finally {
      if (pending.current === abort) pending.current = null;
      if (!abort.signal.aborted) {
        setBusy(null);
        onReferenceLock?.(keepReference);
      }
    }
  }
  async function read(executionId = lookup) {
    if (pending.current || denied) return;
    setDetail(null);
    setLookupMessage('');
    const parsed = organizationIdSchema.safeParse(executionId.trim());
    if (!parsed.success) {
      setLookupMessage('Informe um identificador de diagnóstico válido.');
      return;
    }
    const selected = parsed.data.toLowerCase();
    const abort = new AbortController();
    pending.current = abort;
    setBusy('lookup');
    onReferenceLock?.(true);
    try {
      const response = await fetch(`${path}/${selected}`, {
        cache: 'no-store',
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (rejectAccess(response.status)) return;
      if (response.status === 404) {
        setLookupMessage('Diagnóstico não encontrado nesta organização.');
        return;
      }
      if (response.status !== 200) throw new Error('Lookup unavailable');
      const data = syntheticDiagnosticExecutionDetailSchema.parse(
        await response.json(),
      );
      if (abort.signal.aborted) return;
      if (
        data.id !== selected ||
        (receipt?.id === selected && data.batchId !== receipt.batchId)
      )
        throw new Error('Execution mismatch');
      setDetail(data);
    } catch {
      if (!abort.signal.aborted)
        setLookupMessage('Consulta indisponível. Tente novamente.');
    } finally {
      if (pending.current === abort) pending.current = null;
      if (!abort.signal.aborted) {
        setBusy(null);
        onReferenceLock?.(uncertain);
      }
    }
  }
  function reset() {
    if (pending.current || denied) return;
    intention.current = null;
    focusBatch.current = true;
    setReceipt(null);
    setDetail(null);
    setLookup('');
    setBatchId('');
    setMessage('');
    setLookupMessage('');
    setUncertain(false);
  }
  return (
    <section
      className="synthetic-diagnostic-panel"
      aria-labelledby={`${id}-heading`}
    >
      <h3 id={`${id}-heading`}>Diagnósticos sintéticos</h3>
      <p>Comparação demonstrativa de dados sintéticos, sem validade fiscal.</p>
      {canCreate && !denied && (
        <form
          aria-label="Executar diagnóstico sintético"
          aria-busy={busy === 'create'}
          aria-describedby={message ? `${id}-create-error` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label htmlFor={`${id}-batch`}>Lote para diagnóstico</label>
          <input
            id={`${id}-batch`}
            ref={batchInput}
            value={batchId}
            maxLength={80}
            disabled={frozen}
            aria-describedby={`${id}-batch-help`}
            onChange={(event) => {
              if (frozen || pending.current) return;
              setBatchId(event.target.value);
              setMessage('');
            }}
          />
          <p id={`${id}-batch-help`}>
            Informe o identificador de um lote existente ou use o atalho no lote
            criado ou consultado.
          </p>
          <button type="submit" disabled={frozen}>
            Executar diagnóstico
          </button>
        </form>
      )}
      {busy === 'create' && <p role="status">Executando diagnóstico…</p>}
      {message && (
        <p role="alert" id={`${id}-create-error`}>
          {message}
        </p>
      )}
      {uncertain && !denied && (
        <>
          <p>
            A execução pode ter sido concluída. Repita a mesma referência antes
            de iniciar outro diagnóstico.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void create(true)}
          >
            Repetir o mesmo diagnóstico
          </button>
        </>
      )}
      {receipt && (
        <section aria-label="Recibo do diagnóstico">
          <p role="status">
            {replayed ? 'Diagnóstico recuperado.' : 'Diagnóstico registrado.'}
          </p>
          <p>
            Identificador: <strong>{receipt.id}</strong>
          </p>
          <p>Lote de origem: {receipt.batchId}</p>
          <p>Registrado em: {receipt.createdAt}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void read(receipt.id)}
          >
            Consultar resultado
          </button>
        </section>
      )}
      {receipt && canCreate && !denied && (
        <button type="button" disabled={busy !== null} onClick={reset}>
          Preparar outro diagnóstico
        </button>
      )}
      {!denied && (
        <form
          aria-label="Consultar diagnóstico sintético"
          aria-busy={busy === 'lookup'}
          aria-describedby={lookupMessage ? `${id}-lookup-error` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <label htmlFor={`${id}-lookup`}>Identificador do diagnóstico</label>
          <input
            id={`${id}-lookup`}
            value={lookup}
            maxLength={80}
            disabled={busy !== null}
            onChange={(event) => {
              if (pending.current) return;
              setLookup(event.target.value);
              setDetail(null);
              setLookupMessage('');
            }}
          />
          <button type="submit" disabled={busy !== null}>
            Consultar diagnóstico
          </button>
        </form>
      )}
      {busy === 'lookup' && <p role="status">Consultando diagnóstico…</p>}
      {lookupMessage && (
        <p role="alert" id={`${id}-lookup-error`}>
          {lookupMessage}
        </p>
      )}
      {detail && (
        <section aria-label="Resultado do diagnóstico">
          <p role="status">Diagnóstico consultado.</p>
          <p>Identificador: {detail.id}</p>
          <p>Lote de origem: {detail.batchId}</p>
          <p>
            Regra demonstrativa: {detail.ruleId} / {detail.ruleVersion}
          </p>
          <p>Registrado em: {detail.createdAt}</p>
          <p>
            Fonte: especificação de fixture do projeto. Sem validade fiscal.
          </p>
          <div
            className="diagnostic-evidence"
            role="region"
            aria-label="Tabela de evidências"
            tabIndex={0}
          >
            <table>
              <caption>Evidências por documento, em centavos</caption>
              <thead>
                <tr>
                  <th scope="col">Referência</th>
                  <th scope="col">Linhas</th>
                  <th scope="col">Total declarado</th>
                  <th scope="col">Soma calculada</th>
                  <th scope="col">Diferença</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {detail.diagnostic.documents.map((document, index) => (
                  <tr key={index}>
                    <th scope="row">{document.reference}</th>
                    <td>{document.lineAmountsCents.join(', ')}</td>
                    <td>{document.declaredTotalCents}</td>
                    <td>{document.computedTotalCents}</td>
                    <td>{document.differenceCents}</td>
                    <td>
                      {document.outcome === 'match'
                        ? 'Totais correspondem'
                        : 'Divergência demonstrativa'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
