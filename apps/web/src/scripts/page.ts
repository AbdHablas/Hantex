import { normalizeContact } from '@hantex/shared';

/* Countdown to the launch date entered in the dashboard. */
const countdown = document.querySelector<HTMLElement>('[data-countdown]');
if (countdown) {
  const target = Date.parse(countdown.dataset['countdown'] ?? '');
  const units = {
    days: 86_400_000,
    hours: 3_600_000,
    minutes: 60_000,
    seconds: 1_000,
  } as const;
  const tick = () => {
    let left = Math.max(0, target - Date.now());
    for (const [unit, ms] of Object.entries(units)) {
      const value = Math.floor(left / ms);
      left -= value * ms;
      const cell = countdown.querySelector(`[data-unit="${unit}"]`);
      if (cell) cell.textContent = String(value).padStart(unit === 'days' ? 1 : 2, '0');
    }
  };
  if (Number.isFinite(target)) {
    tick();
    setInterval(tick, 1000);
  }
}

/* Launch sign-up (D-018): email or WhatsApp, with consent and Cloudflare Turnstile. */
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
        },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

const form = document.querySelector<HTMLFormElement>('[data-signup]');
if (form) {
  const message = form.querySelector<HTMLElement>('.message');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const messages = JSON.parse(message?.dataset['messages'] ?? '{}') as Record<string, string>;
  let token = '';
  let widget: string | undefined;

  const say = (key: string, tone: 'error' | 'success') => {
    if (!message) return;
    message.textContent = messages[key] ?? messages['request-error'] ?? key;
    message.dataset['tone'] = tone;
  };

  const holder = form.querySelector<HTMLElement>('[data-turnstile]');
  const sitekey = form.dataset['turnstileKey'] ?? '';
  const render = () => {
    if (holder && window.turnstile && widget === undefined) {
      widget = window.turnstile.render(holder, {
        sitekey,
        callback: (value) => (token = value),
        'expired-callback': () => (token = ''),
      });
    }
  };
  // Turnstile loads only when the visitor starts filling in the form.
  form.addEventListener(
    'focusin',
    () => {
      if (window.turnstile) return render();
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    },
    { once: true },
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const contact = normalizeContact(field('contact'));
    if (!contact.ok) return say(contact.error, 'error');
    if (data.get('consent') !== 'on') return say('consent-required', 'error');
    if (!token) return say('captcha-failed', 'error');
    if (button) {
      button.disabled = true;
      button.textContent = button.dataset['sending'] ?? '';
    }
    fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: field('contact'),
        consent: true,
        locale: form.dataset['locale'],
        turnstileToken: token,
        website: field('website'),
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.ok) {
          form.reset();
          say('thanks', 'success');
        } else {
          say(body.error ?? 'request-error', 'error');
        }
      })
      .catch(() => say('request-error', 'error'))
      .finally(() => {
        token = '';
        window.turnstile?.reset(widget);
        if (button) {
          button.disabled = false;
          button.textContent = button.dataset['label'] ?? '';
        }
      });
  });
}
