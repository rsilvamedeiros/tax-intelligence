'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { SessionExpiryContext } from './auth-session';
import {
  organizationPageSchema,
  organizationContextSchema,
} from '@tax/contracts';
type Page = ReturnType<typeof organizationPageSchema.parse>;
type Context = ReturnType<typeof organizationContextSchema.parse>;
const labels = {
  organization_admin: 'Administração',
  analyst: 'Análise',
  reviewer: 'Revisão',
  viewer: 'Leitura',
};
export function OrganizationPanel({
  onSessionExpired,
}: {
  onSessionExpired?: () => void;
}) {
  const accountExpiry = useContext(SessionExpiryContext);
  const expire = onSessionExpired ?? accountExpiry;
  const [page, setPage] = useState<Page>({ items: [], nextCursor: null });
  const [selected, setSelected] = useState<Context | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [selectionState, setSelectionState] = useState<
    'idle' | 'loading' | 'denied' | 'unavailable'
  >('idle');
  const [navigation, setNavigation] = useState<{
    cursor?: string;
    previous: (string | undefined)[];
    revision: number;
  }>({ previous: [], revision: 0 });
  const pendingSelection = useRef<AbortController | null>(null);
  function navigate(cursor?: string, previous: (string | undefined)[] = []) {
    pendingSelection.current?.abort();
    setSelected(null);
    setSelectionState('idle');
    setPage({ items: [], nextCursor: null });
    setState('loading');
    setNavigation((current) => ({
      cursor,
      previous,
      revision: current.revision + 1,
    }));
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') navigate();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams({ limit: '25' });
    if (navigation.cursor) query.set('cursor', navigation.cursor);
    void fetch(`/api/organizations?${query}`, {
      cache: 'no-store',
      signal: abort.signal,
    })
      .then(async (response) => {
        if (abort.signal.aborted) return;
        if (response.status === 401) {
          expire();
          setState('unavailable');
          return;
        }
        if (!response.ok) throw new Error('Organizations unavailable');
        const data = organizationPageSchema.parse(await response.json());
        if (!abort.signal.aborted) {
          setPage(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setState('unavailable');
      });
    return () => {
      abort.abort();
      pendingSelection.current?.abort();
    };
  }, [navigation, expire]);
  async function select(id: string) {
    pendingSelection.current?.abort();
    const abort = new AbortController();
    pendingSelection.current = abort;
    setSelected(null);
    setSelectionState('loading');
    try {
      const response = await fetch(`/api/organizations/${id}/context`, {
        cache: 'no-store',
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (response.status === 401) {
        expire();
        setSelectionState('unavailable');
        return;
      }
      if (response.status === 403) {
        setSelectionState('denied');
        return;
      }
      if (!response.ok) throw new Error('Context unavailable');
      const context = organizationContextSchema.parse(await response.json());
      if (context.organization.id !== id) throw new Error('Context mismatch');
      if (!abort.signal.aborted) {
        setSelected(context);
        setSelectionState('idle');
      }
    } catch {
      if (!abort.signal.aborted) setSelectionState('unavailable');
    }
  }
  return (
    <section aria-labelledby="organizations-heading" className="status-card">
      <h2 id="organizations-heading">Organizações</h2>
      {state === 'loading' && <p role="status">Carregando organizações…</p>}
      {state === 'unavailable' && (
        <>
          <p role="alert">Organizações indisponíveis. Tente novamente.</p>
          <button type="button" onClick={() => navigate()}>
            Tentar novamente
          </button>
        </>
      )}
      {state === 'ready' && (
        <>
          {!page.items.length && (
            <p>Nenhuma organização disponível para sua conta.</p>
          )}
          <ul className="organization-list">
            {page.items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{labels[item.role]}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Selecionar ${item.name}`}
                  disabled={selectionState === 'loading'}
                  onClick={() => void select(item.id)}
                >
                  Selecionar
                </button>
              </li>
            ))}
          </ul>
          <nav
            aria-label="Paginação de organizações"
            className="organization-actions"
          >
            <button type="button" onClick={() => navigate()}>
              Atualizar organizações
            </button>
            {navigation.previous.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    navigation.previous.at(-1),
                    navigation.previous.slice(0, -1),
                  )
                }
              >
                Organizações anteriores
              </button>
            )}
            {page.nextCursor && (
              <button
                type="button"
                onClick={() =>
                  navigate(page.nextCursor!, [
                    ...navigation.previous,
                    navigation.cursor,
                  ])
                }
              >
                Próximas organizações
              </button>
            )}
          </nav>
        </>
      )}
      {selectionState === 'loading' && (
        <p role="status">Verificando acesso à organização…</p>
      )}
      {selectionState === 'denied' && (
        <p role="alert">
          Acesso a esta organização indisponível. Atualize a lista e tente
          novamente.
        </p>
      )}
      {selectionState === 'unavailable' && (
        <p role="alert">
          Não foi possível selecionar a organização. Tente novamente.
        </p>
      )}
      {selected && (
        <p role="status">
          Organização selecionada: {selected.organization.name}
        </p>
      )}
    </section>
  );
}
