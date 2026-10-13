'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  administrativeMembershipPageSchema,
  organizationIdSchema,
  organizationRoleSchema,
} from '@tax/contracts';
type Page = ReturnType<typeof administrativeMembershipPageSchema.parse>;
type Role = ReturnType<typeof organizationRoleSchema.parse>;
const labels: Record<Role, string> = {
  organization_admin: 'Administração',
  analyst: 'Análise',
  reviewer: 'Revisão',
  viewer: 'Leitura',
};
function RoleOptions() {
  return organizationRoleSchema.options.map((role) => (
    <option key={role} value={role}>
      {labels[role]}
    </option>
  ));
}
function MemberRow({
  member,
  busy,
  mutate,
}: {
  member: Page['items'][number];
  busy: boolean;
  mutate: (method: 'PATCH' | 'DELETE', actor: string, role?: Role) => void;
}) {
  const id = useId();
  const [role, setRole] = useState<Role>(member.role);
  const [confirm, setConfirm] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (confirm) cancel.current?.focus();
    else if (restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [confirm]);
  return (
    <li>
      <div>
        <strong>{member.actorId}</strong>
        <p>
          {labels[member.role]} ·{' '}
          <span>{member.status === 'active' ? 'Ativo' : 'Revogado'}</span>
        </p>
      </div>
      {member.status === 'active' && (
        <div className="membership-controls">
          <label htmlFor={id}>Novo papel</label>
          <select
            id={id}
            value={role}
            disabled={busy || confirm}
            onChange={(e) =>
              setRole(organizationRoleSchema.parse(e.target.value))
            }
          >
            <RoleOptions />
          </select>
          <button
            type="button"
            disabled={busy || confirm || role === member.role}
            onClick={() => mutate('PATCH', member.actorId, role)}
          >
            Salvar papel
          </button>
          <button
            ref={trigger}
            type="button"
            disabled={busy || confirm}
            onClick={() => setConfirm(true)}
          >
            Revogar acesso
          </button>
          {confirm && (
            <div
              role="group"
              aria-label={`Confirmar revogação de ${member.actorId}`}
            >
              <p>
                Revogar acesso deste membro? A reativação não está disponível.
              </p>
              <button
                ref={cancel}
                type="button"
                disabled={busy}
                onClick={() => {
                  restoreFocus.current = true;
                  setConfirm(false);
                }}
              >
                Cancelar revogação
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate('DELETE', member.actorId)}
              >
                Confirmar revogação
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
export function MembershipPanel({
  organizationId,
  csrfToken,
  onSessionExpired,
}: {
  organizationId: string;
  csrfToken: string;
  onSessionExpired: () => void;
}) {
  const id = useId();
  const [page, setPage] = useState<Page | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'denied'>(
    'loading',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [actor, setActor] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [navigation, setNavigation] = useState<{
    cursor?: string;
    previous: (string | undefined)[];
    revision: number;
  }>({ previous: [], revision: 0 });
  const pending = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const base = `/api/organizations/${organizationId}/memberships`;
  function navigate(cursor?: string, previous: (string | undefined)[] = []) {
    reading.current?.abort();
    setPage(null);
    setState('loading');
    setMessage('');
    setActor('');
    setRole('viewer');
    setNavigation((current) => ({
      cursor,
      previous,
      revision: current.revision + 1,
    }));
  }
  useEffect(() => {
    const abort = new AbortController();
    reading.current = abort;
    const query = new URLSearchParams({ limit: '25' });
    if (navigation.cursor) query.set('cursor', navigation.cursor);
    void fetch(`${base}?${query}`, { cache: 'no-store', signal: abort.signal })
      .then(async (response) => {
        if (abort.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setPage(null);
          setState('denied');
          setMessage(
            response.status === 401
              ? 'Sessão expirada. Entre novamente.'
              : 'Administração indisponível. Selecione a organização novamente.',
          );
          if (response.status === 401) onSessionExpired();
          return;
        }
        if (response.status !== 200) throw new Error('Directory unavailable');
        const data = administrativeMembershipPageSchema.parse(
          await response.json(),
        );
        if (!abort.signal.aborted) {
          setPage(data);
          setState('ready');
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setPage(null);
          setState('error');
          setMessage('Membros indisponíveis. Consulte novamente.');
        }
      });
    return () => {
      abort.abort();
      pending.current?.abort();
    };
  }, [base, navigation, onSessionExpired]);
  async function mutate(
    method: 'PUT' | 'PATCH' | 'DELETE',
    actorId: string,
    targetRole?: Role,
  ) {
    if (pending.current || state !== 'ready') return;
    if (!organizationIdSchema.safeParse(actorId).success) {
      setMessage('Informe um UUID válido de ator existente.');
      return;
    }
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${base}/${actorId}`, {
        method,
        cache: 'no-store',
        signal: abort.signal,
        headers: {
          'x-csrf-token': csrfToken,
          ...(method !== 'DELETE'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(method !== 'DELETE'
          ? { body: JSON.stringify({ role: targetRole }) }
          : {}),
      });
      if (abort.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setPage(null);
        setActor('');
        setState('denied');
        setMessage(
          response.status === 401
            ? 'Sessão expirada. Entre novamente.'
            : 'Administração indisponível. Selecione a organização novamente.',
        );
        if (response.status === 401) onSessionExpired();
        return;
      }
      if (response.status !== 204) {
        setPage(null);
        setActor('');
        setState('error');
        setMessage(
          response.status === 409
            ? 'Conflito de acesso. Consulte os membros antes de outra alteração.'
            : response.status === 404
              ? 'Ator ou vínculo indisponível. Consulte os membros novamente.'
              : 'Não foi possível confirmar a alteração. Consulte os membros novamente.',
        );
        return;
      }
      navigate();
    } catch {
      if (!abort.signal.aborted) {
        setPage(null);
        setActor('');
        setState('error');
        setMessage(
          'Não foi possível confirmar a alteração. Consulte os membros novamente.',
        );
      }
    } finally {
      if (!abort.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="membership-panel">
      <h3 id={`${id}-heading`}>Membros</h3>
      {state === 'loading' && <p role="status">Carregando membros…</p>}
      {busy && <p role="status">Confirmando alteração…</p>}
      {message && <p role="alert">{message}</p>}
      {state === 'error' && (
        <button type="button" onClick={() => navigate()}>
          Consultar membros novamente
        </button>
      )}
      {state === 'ready' && page && (
        <>
          {!page.items.length && <p>Nenhum membro nesta página.</p>}
          <ul className="organization-list membership-list">
            {page.items.map((member) => (
              <MemberRow
                key={`${navigation.revision}:${member.actorId}`}
                member={member}
                busy={busy}
                mutate={(method, actorId, targetRole) =>
                  void mutate(method, actorId, targetRole)
                }
              />
            ))}
          </ul>
          <nav
            aria-label="Paginação de membros"
            className="organization-actions"
          >
            <button type="button" disabled={busy} onClick={() => navigate()}>
              Atualizar membros
            </button>
            {!!navigation.previous.length && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  navigate(
                    navigation.previous.at(-1),
                    navigation.previous.slice(0, -1),
                  )
                }
              >
                Membros anteriores
              </button>
            )}
            {page.nextCursor && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  navigate(page.nextCursor!, [
                    ...navigation.previous,
                    navigation.cursor,
                  ])
                }
              >
                Próximos membros
              </button>
            )}
          </nav>
          <form
            aria-label="Conceder acesso"
            className="membership-grant"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void mutate('PUT', actor.trim(), role);
            }}
          >
            <h4>Conceder acesso</h4>
            <p id={`${id}-hint`}>
              Informe o UUID de um ator já cadastrado. Esta ação não cria uma
              conta nem reativa acesso revogado.
            </p>
            <label htmlFor={`${id}-actor`}>UUID do ator existente</label>
            <input
              id={`${id}-actor`}
              aria-describedby={`${id}-hint`}
              value={actor}
              maxLength={36}
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setActor(e.target.value)}
            />
            <label htmlFor={`${id}-role`}>Papel para concessão</label>
            <select
              id={`${id}-role`}
              disabled={busy}
              value={role}
              onChange={(e) =>
                setRole(organizationRoleSchema.parse(e.target.value))
              }
            >
              <RoleOptions />
            </select>
            <button type="submit" disabled={busy}>
              Conceder acesso
            </button>
          </form>
        </>
      )}
    </section>
  );
}
