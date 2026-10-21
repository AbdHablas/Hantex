export interface TurnstileVerifier {
  verify(token: string, remoteIp: string | null): Promise<boolean>;
}

/** Cloudflare Turnstile server-side validation. */
export function cloudflareTurnstile(secret: string): TurnstileVerifier {
  return {
    async verify(token, remoteIp) {
      if (!token) return false;
      const body = new FormData();
      body.append('secret', secret);
      body.append('response', token);
      if (remoteIp) body.append('remoteip', remoteIp);
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      if (!response.ok) return false;
      const result: { success?: boolean } = await response.json();
      return result.success === true;
    },
  };
}
