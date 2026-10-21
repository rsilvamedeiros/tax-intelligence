'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  organizationIdSchema,
  syntheticDocumentBatchInputSchema,
  syntheticDocumentBatchReceiptSchema,
  syntheticDocumentBatchDetailSchema,
} from '@tax/contracts';

export interface BatchPanelProps {
  organizationId: string;
  csrfToken: string;
  role: 'organization_admin' | 'analyst' | 'reviewer' | 'viewer';
  onSessionExpired: () => void;
}
type Draft = { key: number; reference: string; total: string; lines: string };
const blank = (key: number): Draft => ({
  key,
  reference: '',
  total: '',
  lines: '',
});
type Receipt = ReturnType<typeof syntheticDocumentBatchReceiptSchema.parse>;
type Detail = ReturnType<typeof syntheticDocumentBatchDetailSchema.parse>;
export function SyntheticBatchPanel(props: BatchPanelProps) {
  return (
    <BatchWorkspace
      key={`${props.organizationId}:${props.csrfToken}:${props.role}`}
      {...props}
    />
  );
}
function BatchWorkspace({
  organizationId,
  csrfToken,
  role,
  onSessionExpired,
}: BatchPanelProps) {
  const id = useId();
  const [drafts, setDrafts] = useState<Draft[]>([blank(0)]);
  const nextKey = useRef(1);
  const [message, setMessage] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState<'create' | 'lookup' | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [denied, setDenied] = useState(false);
  const intention = useRef<{ key: string; body: string } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const newField = useRef<number | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const focusAdd = useRef(false);
  const canCreate = role === 'organization_admin' || role === 'analyst';
  const frozen = busy !== null || uncertain || conflicted || receipt !== null;
  const path = `/api/organizations/${organizationId}/synthetic-document-batches`;
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (focusAdd.current) {
      addButton.current?.focus();
      focusAdd.current = false;
    }
  }, [drafts.length]);
  function clearAccess(text: string) {
    intention.current = null;
    setDrafts([blank(0)]);
    setReceipt(null);
    setDetail(null);
    setLookup('');
    setLookupMessage('');
    setUncertain(false);
    setConflicted(false);
    setDenied(true);
    setMessage(text);
  }
  function rejectAccess(status: number) {
    if (status === 401) {
      clearAccess('Sessão encerrada. Entre novamente.');
      onSessionExpired();
      return true;
    }
    if (status === 403) {
      clearAccess('Acesso indisponível. Selecione a organização novamente.');
      return true;
    }
    return false;
  }
  function update(
    key: number,
    field: 'reference' | 'total' | 'lines',
    value: string,
  ) {
    if (frozen || pending.current) return;
    setDrafts((items) =>
      items.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
    setMessage('');
  }
  async function create() {
    if (!canCreate || denied || conflicted || receipt || pending.current)
      return;
    if (!intention.current) {
      const numeric = drafts.every((draft) => {
        if (!/^\d{1,10}$/.test(draft.total) || draft.lines.length > 4096)
          return false;
        const values = draft.lines.split(',');
        return (
          values.length <= 10 &&
          values.every((value) => /^\d{1,10}$/.test(value.trim()))
        );
      });
      if (!numeric) {
        setMessage('Informe valores inteiros em centavos.');
        return;
      }
      const parsed = syntheticDocumentBatchInputSchema.safeParse({
        schemaVersion: 'synthetic-document-batch-v1',
        documents: drafts.map((draft) => ({
          reference: draft.reference,
          declaredTotalCents: Number(draft.total),
          lineAmountsCents: draft.lines
            .split(',')
            .map((value) => Number(value.trim())),
        })),
      });
      if (!parsed.success) {
        setMessage(
          'Revise referências, valores e limites de documentos e linhas.',
        );
        return;
      }
      try {
        intention.current = {
          key: crypto.randomUUID(),
          body: JSON.stringify(parsed.data),
        };
      } catch {
        setMessage('Não foi possível iniciar a criação. Tente novamente.');
        return;
      }
    }
    const abort = new AbortController();
    pending.current = abort;
    setBusy('create');
    setMessage('');
    setReceipt(null);
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
          'Idempotency-Key': intention.current.key,
        },
        body: intention.current.body,
      });
      if (abort.signal.aborted) return;
      if (rejectAccess(response.status)) return;
      if (response.status === 409) {
        setConflicted(true);
        setUncertain(false);
        setMessage(
          'Conflito na criação. Selecione a organização novamente para reconciliar o lote.',
        );
        return;
      }
      if ([400, 413, 415].includes(response.status)) {
        intention.current = null;
        setUncertain(false);
        setMessage(
          'Entrada rejeitada. Revise os documentos antes de tentar novamente.',
        );
        return;
      }
      if (response.status !== 200 && response.status !== 201)
        throw new Error('Creation unavailable');
      const data = syntheticDocumentBatchReceiptSchema.parse(
        await response.json(),
      );
      if (abort.signal.aborted) return;
      setReceipt(data);
      setLookup(data.id);
      intention.current = null;
      setUncertain(false);
    } catch {
      if (!abort.signal.aborted) {
        setMessage('Não foi possível confirmar a criação.');
        setUncertain(true);
      }
    } finally {
      if (pending.current === abort) pending.current = null;
      if (!abort.signal.aborted) setBusy(null);
    }
  }
  async function read() {
    if (pending.current || denied) return;
    setDetail(null);
    setLookupMessage('');
    const parsed = organizationIdSchema.safeParse(lookup.trim());
    if (!parsed.success) {
      setLookupMessage('Informe um identificador de lote válido.');
      return;
    }
    const batchId = parsed.data.toLowerCase();
    const abort = new AbortController();
    pending.current = abort;
    setBusy('lookup');
    try {
      const response = await fetch(`${path}/${batchId}`, {
        cache: 'no-store',
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (rejectAccess(response.status)) return;
      if (response.status === 404) {
        setLookupMessage('Lote não encontrado nesta organização.');
        return;
      }
      if (response.status !== 200) throw new Error('Lookup unavailable');
      const data = syntheticDocumentBatchDetailSchema.parse(
        await response.json(),
      );
      if (abort.signal.aborted) return;
      if (data.id !== batchId) throw new Error('Batch mismatch');
      setDetail(data);
    } catch {
      if (!abort.signal.aborted)
        setLookupMessage('Consulta indisponível. Tente novamente.');
    } finally {
      if (pending.current === abort) pending.current = null;
      if (!abort.signal.aborted) setBusy(null);
    }
  }
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="synthetic-batch-panel"
    >
      <h3 id={`${id}-heading`}>Lotes sintéticos</h3>
      <p>Use apenas dados sintéticos. Sem validade fiscal.</p>
      {canCreate && !denied && (
        <form
          aria-label="Criar lote sintético"
          aria-busy={busy === 'create'}
          aria-describedby={message ? `${id}-create-error` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          {drafts.map((draft, index) => (
            <fieldset disabled={frozen} key={draft.key}>
              <legend>Documento {index + 1}</legend>
              <label htmlFor={`${id}-reference-${draft.key}`}>
                Referência do documento {index + 1}
              </label>
              <input
                id={`${id}-reference-${draft.key}`}
                value={draft.reference}
                aria-describedby={`${id}-reference-help-${draft.key}`}
                onChange={(event) =>
                  update(draft.key, 'reference', event.target.value)
                }
                ref={(node) => {
                  if (node && newField.current === draft.key) {
                    node.focus();
                    newField.current = null;
                  }
                }}
              />
              <p id={`${id}-reference-help-${draft.key}`}>
                Use 1 a 40 letras minúsculas, números ou hífen. A referência
                deve ser única no lote.
              </p>
              <label htmlFor={`${id}-total-${draft.key}`}>
                Total declarado em centavos do documento {index + 1}
              </label>
              <input
                id={`${id}-total-${draft.key}`}
                inputMode="numeric"
                value={draft.total}
                aria-describedby={`${id}-total-help-${draft.key}`}
                onChange={(event) =>
                  update(draft.key, 'total', event.target.value)
                }
              />
              <p id={`${id}-total-help-${draft.key}`}>
                Informe de 0 a 1000000000 centavos, sem casas decimais.
              </p>
              <label htmlFor={`${id}-lines-${draft.key}`}>
                Valores das linhas em centavos do documento {index + 1}
              </label>
              <input
                id={`${id}-lines-${draft.key}`}
                value={draft.lines}
                onChange={(event) =>
                  update(draft.key, 'lines', event.target.value)
                }
                aria-describedby={`${id}-help-${draft.key}`}
              />
              <p id={`${id}-help-${draft.key}`}>
                Separe até 10 valores inteiros por vírgula. Máximo: 1000000000
                centavos por valor.
              </p>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!frozen && !pending.current) {
                      focusAdd.current = true;
                      setDrafts((items) =>
                        items.length > 1
                          ? items.filter((item) => item.key !== draft.key)
                          : items,
                      );
                    }
                  }}
                >
                  Remover documento {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          <button
            ref={addButton}
            type="button"
            disabled={frozen || drafts.length >= 10}
            onClick={() => {
              if (frozen || pending.current || drafts.length >= 10) return;
              const key = nextKey.current++;
              newField.current = key;
              setDrafts((items) =>
                items.length >= 10 ? items : [...items, blank(key)],
              );
            }}
          >
            Adicionar documento
          </button>
          <button disabled={frozen} type="submit">
            Criar lote sintético
          </button>
        </form>
      )}
      {busy === 'create' && <p role="status">Criando lote…</p>}
      {message && (
        <p role="alert" id={`${id}-create-error`}>
          {message}
        </p>
      )}
      {uncertain && !denied && (
        <>
          <p>
            A criação pode ter sido concluída. Repita o mesmo comando antes de
            trocar de organização.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void create()}
          >
            Repetir a mesma criação
          </button>
        </>
      )}
      {receipt && (
        <section aria-label="Recibo do lote">
          <p role="status">Lote criado ou recuperado.</p>
          <p>
            Identificador: <strong>{receipt.id}</strong>
          </p>
          <p>Criado em: {receipt.createdAt}</p>
        </section>
      )}
      {receipt && canCreate && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (pending.current || denied) return;
            intention.current = null;
            setReceipt(null);
            setDetail(null);
            setLookup('');
            setMessage('');
            setLookupMessage('');
            const key = nextKey.current++;
            newField.current = key;
            setDrafts([blank(key)]);
          }}
        >
          Preparar novo lote
        </button>
      )}
      {!denied && (
        <form
          aria-label="Consultar lote sintético"
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <label htmlFor={`${id}-lookup`}>Identificador do lote</label>
          <input
            id={`${id}-lookup`}
            value={lookup}
            disabled={busy !== null}
            onChange={(event) => {
              if (pending.current) return;
              setLookup(event.target.value);
              setDetail(null);
              setLookupMessage('');
            }}
          />
          <button type="submit" disabled={busy !== null}>
            Consultar lote
          </button>
        </form>
      )}
      {busy === 'lookup' && <p role="status">Consultando lote…</p>}
      {lookupMessage && <p role="alert">{lookupMessage}</p>}
      {detail && (
        <section aria-label="Detalhe do lote">
          <p role="status">Lote consultado.</p>
          <p>
            Identificador: <strong>{detail.id}</strong>
          </p>
          <p>Criado em: {detail.createdAt}</p>
          <ul>
            {detail.documents.map((document) => (
              <li key={document.reference}>
                <strong>{document.reference}</strong>
                <p>
                  Total declarado em centavos: {document.declaredTotalCents}
                </p>
                <p>
                  Valores das linhas em centavos:{' '}
                  {document.lineAmountsCents.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
