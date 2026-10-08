import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AuthPanel } from './auth-panel';
describe('Accessible account session', () => {
  const current = {
    authenticated: true,
    identity: {
      issuer: 'https://identity.example.test',
      subject: 'synthetic-subject',
    },
    csrfToken: 'x'.repeat(43),
  };
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  it('offers login when there is no session', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue({ status: 401, ok: false } as Response);
    render(<AuthPanel />);
    expect(await screen.findByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/api/auth/login',
    );
  });
  it('shows an active session and sends csrf protection on logout', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => current,
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    render(<AuthPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'x-csrf-token': current.csrfToken },
        }),
      ),
    );
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });
  it('announces loading accessibly', () => {
    jest.mocked(fetch).mockReturnValue(new Promise(() => {}));
    render(<AuthPanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão');
  });
  it('supports retry after an unavailable session service', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    render(<AuthPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    );
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });
  it('rejects unexpected session payloads', async () => {
    jest.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...current, accessToken: 'sensitive-sentinel' }),
    } as Response);
    render(<AuthPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Acesso indisponível',
    );
    expect(screen.queryByText('sensitive-sentinel')).not.toBeInTheDocument();
  });
  it('preserves the session and announces failed logout', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => current,
      } as Response)
      .mockRejectedValueOnce(new Error('synthetic-error'));
    render(<AuthPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível sair',
    );
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
  it('offers login when the session expired before logout', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => current,
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    render(<AuthPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });
  it('rechecks an expired session when the page becomes active', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => current,
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    render(<AuthPanel />);
    await screen.findByRole('button', { name: 'Sair' });
    fireEvent(window, new Event('focus'));
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });
  it('refreshes CSRF after another login replaces the cookie', async () => {
    const replaced = { ...current, csrfToken: 'y'.repeat(43) };
    jest
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => current,
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => replaced,
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    render(<AuthPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(
      await screen.findByRole('link', { name: 'Entrar' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({
        headers: { 'x-csrf-token': replaced.csrfToken },
      }),
    );
  });
  it('has no automatically detectable accessibility violations', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValue({ ok: false, status: 401 } as Response);
    const { container } = render(<AuthPanel />);
    await screen.findByRole('link', { name: 'Entrar' });
    expect((await axe(container)).violations).toEqual([]);
  });
});
