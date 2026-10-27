import { normalizeContact } from '@hantex/shared/contact';

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
      const cell = countdown.querySelector<HTMLElement>(`[data-unit="${unit}"]`);
      const text = String(value).padStart(unit === 'days' ? 1 : 2, '0');
      if (cell && cell.textContent !== text) {
        cell.textContent = text;
        // Restart the digit animation (styles skip it when motion is reduced).
        cell.classList.remove('tick');
        void cell.offsetWidth;
        cell.classList.add('tick');
      }
    }
  };
  if (Number.isFinite(target)) {
    tick();
    setInterval(tick, 1000);
  }
}

/* Sections fade in as they scroll into view, where CSS scroll-driven animations are missing. */
const reveals = document.querySelectorAll<HTMLElement>('.reveal');
if (
  reveals.length > 0 &&
  'IntersectionObserver' in window &&
  !CSS.supports('animation-timeline: view()') &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches
) {
  // Sections already on screen show at once, so nothing visible flickers.
  for (const el of reveals) {
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-visible');
  }
  document.documentElement.classList.add('reveal-ready');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  for (const el of reveals) if (!el.classList.contains('is-visible')) observer.observe(el);
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
  const buttonLabel = form.querySelector<HTMLElement>('[data-button-label]');
  const input = form.querySelector<HTMLInputElement>('#contact');
  const inputLabel = form.querySelector<HTMLElement>('[data-contact-label]');

  // Email or WhatsApp: only the field's hints change; the server accepts either in one field.
  form.addEventListener('change', (event) => {
    const radio = event.target as HTMLInputElement;
    if (radio.name !== 'method' || !input) return;
    const whatsapp = radio.value === 'whatsapp';
    form.dataset['method'] = whatsapp ? 'whatsapp' : 'email';
    input.inputMode = whatsapp ? 'tel' : 'email';
    input.autocomplete = whatsapp ? 'tel' : 'email';
    input.placeholder = radio.dataset['placeholder'] ?? '';
    if (inputLabel) inputLabel.textContent = radio.dataset['label'] ?? '';
    if (message) message.textContent = '';
  });
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
    if (button) button.disabled = true;
    if (buttonLabel) buttonLabel.textContent = button?.dataset['sending'] ?? '';
    form.dataset['state'] = 'sending';
    fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: field('contact'),
        consent: true,
        locale: form.dataset['locale'],
        turnstileToken: token,
        purpose: form.dataset['purpose'] ?? 'launch',
        website: field('website'),
      }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.ok) {
          form.reset();
          form.dataset['state'] = 'done';
          say('thanks', 'success');
        } else {
          say(body.error ?? 'request-error', 'error');
        }
      })
      .catch(() => say('request-error', 'error'))
      .finally(() => {
        token = '';
        window.turnstile?.reset(widget);
        if (form.dataset['state'] === 'sending') delete form.dataset['state'];
        if (button) button.disabled = false;
        if (buttonLabel) buttonLabel.textContent = button?.dataset['label'] ?? '';
      });
  });
}

/* Draft previews show one page: links to other addresses stay inside the dashboard's preview. */
if (document.body.hasAttribute('data-preview')) {
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a[href]');
    if (link && !link.getAttribute('href')?.startsWith('#')) event.preventDefault();
  });
}

/*
 * Videos (D-046): the provider's player is loaded only when the visitor presses play. Only the
 * two players the Content-Security-Policy allows are ever framed.
 */
const VIDEO_PLAYERS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'];
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-video]')) {
  link.addEventListener('click', (event) => {
    let src: URL;
    try {
      src = new URL(link.dataset['video'] ?? '');
    } catch {
      return;
    }
    if (!VIDEO_PLAYERS.includes(src.origin)) return;
    event.preventDefault();
    const frame = document.createElement('iframe');
    frame.src = src.toString();
    frame.title = link.dataset['videoTitle'] ?? '';
    frame.className = 'bx-video-frame';
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    // YouTube's player refuses to play without the page's origin as referrer.
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    link.replaceWith(frame);
    frame.focus();
  });
}
