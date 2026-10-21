import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Alert, Button, ErrorText, Field, Input, Loading } from '../components/ui';
import { api } from '../lib/api';
import { useBilingual, useI18n } from '../lib/i18n';
import { registerPasskey, signInWithPasskey } from '../lib/passkey';
import { meQueryKey, useMe } from '../lib/session';

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const { dir, m, locale, setLocale } = useI18n();
  return (
    <div dir={dir} className="flex min-h-dvh items-center justify-center p-4">
      <main className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <div className="mb-6 flex items-center justify-between">
          <img src="/favicon.svg" alt="Hantex Ultra" className="size-10" />
          <button
            type="button"
            className="text-sm text-accent-text underline-offset-4 hover:underline"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            lang={locale === 'ar' ? 'en' : 'ar'}
          >
            {locale === 'ar' ? m.english : m.arabic}
          </button>
        </div>
        <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function SignIn() {
  const { m } = useI18n();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const signIn = useMutation({
    mutationFn: signInWithPasskey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate(from, { replace: true });
    },
  });
  if (me) return <Navigate to={from} replace />;
  return (
    <AuthLayout title={m.auth.signInTitle}>
      <p className="mb-6 text-muted">{m.auth.signInIntro}</p>
      <div className="flex flex-col gap-4">
        <ErrorText error={signIn.error} />
        <Button busy={signIn.isPending} onClick={() => signIn.mutate()}>
          <KeyRound className="size-4" aria-hidden />
          {signIn.isPending ? m.auth.signingIn : m.auth.signIn}
        </Button>
        <Link
          to="/recover"
          className="text-center text-sm text-accent-text underline-offset-4 hover:underline"
        >
          {m.auth.lostDevice}
        </Link>
      </div>
    </AuthLayout>
  );
}

interface InvitationInfo {
  email: string;
  name: string;
  role: { ar: string; en: string };
  ticket: string;
}

/** /accept-invitation#token=… — the token stays in the fragment, which is never sent to servers. */
export function AcceptInvitation() {
  const { m, format } = useI18n();
  const bi = useBilingual();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const opened = useRef(false);

  const open = useMutation({
    mutationFn: (value: string) =>
      api<InvitationInfo>('/enrolment/invitation', { method: 'POST', body: { token: value } }),
  });
  useEffect(() => {
    if (token && !opened.current) {
      opened.current = true;
      // Remove the token from the address bar and history once it has been read.
      window.history.replaceState(null, '', window.location.pathname);
      open.mutate(token);
    }
  }, [token, open]);

  const create = useMutation({
    mutationFn: (ticket: string) => registerPasskey({ ticket }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate('/', { replace: true });
    },
  });

  return (
    <AuthLayout title={m.auth.acceptTitle}>
      {!token && !open.data && !open.isPending && !open.error && (
        <Alert tone="warning">{m.auth.acceptMissing}</Alert>
      )}
      {open.isPending && <Loading />}
      <ErrorText error={open.error} />
      {open.data && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">{format(m.auth.acceptIntro, { role: bi(open.data.role) })}</p>
          <p className="font-medium" dir="ltr">
            {open.data.email}
          </p>
          <ErrorText error={create.error} />
          <Button busy={create.isPending} onClick={() => create.mutate(open.data.ticket)}>
            <KeyRound className="size-4" aria-hidden />
            {m.auth.createPasskey}
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render(
        element: HTMLElement,
        options: { sitekey: string; callback(token: string): void },
      ): string;
      reset(id?: string): void;
    };
  }
}

/** Cloudflare Turnstile on the recovery form (docs/security.md). */
function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void api<{ turnstileSiteKey: string }>('/config').then(({ turnstileSiteKey }) => {
      const render = () => {
        if (!cancelled && ref.current && window.turnstile && !ref.current.hasChildNodes()) {
          window.turnstile.render(ref.current, { sitekey: turnstileSiteKey, callback: onToken });
        }
      };
      if (window.turnstile) return render();
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.append(script);
    });
    return () => {
      cancelled = true;
    };
  }, [onToken]);
  return <div ref={ref} />;
}

export function Recover() {
  const { m } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [missingCaptcha, setMissingCaptcha] = useState(false);

  const start = useMutation({
    mutationFn: () =>
      api('/enrolment/recovery/start', {
        method: 'POST',
        body: { email, turnstileToken: captcha },
      }),
    // A Turnstile token works once: the second step needs a new check.
    onSuccess: () => setCaptcha(''),
  });
  const complete = useMutation({
    mutationFn: async () => {
      const { ticket } = await api<{ ticket: string }>('/enrolment/recovery/complete', {
        method: 'POST',
        body: { email, code, recoveryCode, turnstileToken: captcha },
      });
      await registerPasskey({ ticket });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate('/account', { replace: true, state: { recovered: true } });
    },
  });

  const submit = (event: FormEvent, action: () => void) => {
    event.preventDefault();
    if (!captcha) {
      setMissingCaptcha(true);
      return;
    }
    setMissingCaptcha(false);
    action();
  };

  return (
    <AuthLayout title={m.auth.recoverTitle}>
      <p className="mb-6 text-muted">{m.auth.recoverIntro}</p>
      {!start.isSuccess ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => submit(e, () => start.mutate())}>
          <Field label={m.auth.email}>
            {(props) => (
              <Input
                {...props}
                type="email"
                required
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Turnstile key="start" onToken={setCaptcha} />
          {missingCaptcha && <Alert tone="warning">{m.auth.turnstileMissing}</Alert>}
          <ErrorText error={start.error} />
          <Button type="submit" busy={start.isPending}>
            {m.auth.sendCode}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => submit(e, () => complete.mutate())}>
          <Alert tone="accent">{m.auth.codeSent}</Alert>
          <Field label={m.auth.emailCode}>
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </Field>
          <Field label={m.auth.recoveryCode}>
            {(props) => (
              <Input
                {...props}
                required
                autoComplete="off"
                dir="ltr"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
              />
            )}
          </Field>
          <Turnstile key="complete" onToken={setCaptcha} />
          {missingCaptcha && <Alert tone="warning">{m.auth.turnstileMissing}</Alert>}
          <ErrorText error={complete.error} />
          <Button type="submit" busy={complete.isPending}>
            <KeyRound className="size-4" aria-hidden />
            {m.auth.recoverContinue}
          </Button>
        </form>
      )}
      <Link
        to="/sign-in"
        className="mt-6 block text-center text-sm text-accent-text underline-offset-4 hover:underline"
      >
        {m.back}
      </Link>
    </AuthLayout>
  );
}
