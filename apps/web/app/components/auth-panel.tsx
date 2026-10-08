'use client';
import { useEffect, useState } from 'react';
import { browserSessionSchema } from '@tax/contracts';
export function AuthPanel() {
  const [state, setState] = useState<
    'loading' | 'anonymous' | 'active' | 'unavailable'
  >('loading');
  const [csrf, setCsrf] = useState('');
  const [retry, setRetry] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/auth/session', { cache: 'no-store', signal: abort.signal })
      .then(async (response) => {
        if (response.status === 401) {
          if (!abort.signal.aborted) setState('anonymous');
          return;
        }
        if (!response.ok) throw new Error('Session unavailable');
        const data = browserSessionSchema.parse(await response.json());
        if (!abort.signal.aborted) {
          setCsrf(data.csrfToken);
          setState('active');
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setState('unavailable');
      });
    return () => abort.abort();
  }, [retry]);
  async function logout() {
    setLeaving(true);
    setLogoutError(false);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status !== 403) throw new Error('Logout unavailable');
        const current = await fetch('/api/auth/session', { cache: 'no-store' });
        if (current.status !== 401) throw new Error('Logout unavailable');
      }
      setCsrf('');
      setState('anonymous');
    } catch {
      setLogoutError(true);
    } finally {
      setLeaving(false);
    }
  }
  return (
    <section aria-labelledby="access-heading">
      <h2 id="access-heading">Acesso</h2>
      {state === 'loading' && <p role="status">Verificando sessão…</p>}
      {state === 'anonymous' && <a href="/api/auth/login">Entrar</a>}
      {state === 'active' && (
        <>
          <p role="status">Você está conectado</p>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={leaving}
          >
            {leaving ? 'Saindo…' : 'Sair'}
          </button>
        </>
      )}
      {state === 'unavailable' && (
        <>
          <p role="alert">Acesso indisponível</p>
          <button
            type="button"
            onClick={() => {
              setState('loading');
              setRetry((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {logoutError && (
        <p role="alert">Não foi possível sair. Tente novamente.</p>
      )}
    </section>
  );
}
