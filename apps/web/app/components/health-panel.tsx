'use client';
import { useEffect, useState } from 'react';
import { StatusCard } from '@tax/ui';
import { healthResponseSchema, type HealthResponse } from '@tax/contracts';
type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'ready'; health: HealthResponse };
export function HealthPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (response.status === 204) {
          setState({ kind: 'empty' });
          return;
        }
        if (!response.ok) throw new Error('Service unavailable');
        const health = healthResponseSchema.parse(await response.json());
        if (health.status !== 'ok') throw new Error('Not ready');
        setState({ kind: 'ready', health });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  return (
    <StatusCard title="Status da plataforma">
      <div role="status" aria-live="polite">
        {state.kind === 'loading' && <p>Verificando disponibilidade…</p>}
        {state.kind === 'empty' && <p>Nenhum status disponível.</p>}
        {state.kind === 'error' && (
          <p>API indisponível. Tente novamente em instantes.</p>
        )}
        {state.kind === 'ready' && (
          <>
            <p>API disponível</p>
            {state.health.checks?.database === 'not_configured' && (
              <p>Banco não configurado neste ambiente de fundação.</p>
            )}
          </>
        )}
      </div>
      {(state.kind === 'error' || state.kind === 'empty') && (
        <button
          type="button"
          onClick={() => {
            setState({ kind: 'loading' });
            setAttempt((value) => value + 1);
          }}
        >
          Tentar novamente
        </button>
      )}
    </StatusCard>
  );
}
