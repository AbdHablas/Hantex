export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Resend (D-009). The API key is a Worker secret. */
export function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) throw new Error(`Email provider responded with status ${response.status}`);
    },
  };
}

/** Keeps messages in memory — local development and tests only. */
export function memorySender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Bilingual message: Arabic first (right-to-left), then English. */
function bilingual(subject: string, ar: string[], en: string[]): Omit<EmailMessage, 'to'> {
  const paragraphs = (lines: string[], dir: 'rtl' | 'ltr', lang: string) =>
    `<div dir="${dir}" lang="${lang}">${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>`;
  return {
    subject,
    text: [...ar, '', '—', '', ...en].join('\n'),
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.6">${paragraphs(ar, 'rtl', 'ar')}<hr>${paragraphs(en, 'ltr', 'en')}</body></html>`,
  };
}

export const emailTemplates = {
  invitation(input: {
    inviter: string;
    roleAr: string;
    roleEn: string;
    /** The site the role applies to; null = all sites. */
    siteAr: string | null;
    siteEn: string | null;
    link: string;
    hours: number;
  }) {
    const whereAr = input.siteAr ? `في موقع «${input.siteAr}»` : 'لكل المواقع';
    const whereEn = input.siteEn ? `on ${input.siteEn}` : 'on all sites';
    return bilingual(
      'دعوة إلى لوحة تحكم Hantex Ultra — Invitation to the Hantex Ultra dashboard',
      [
        `دعاك ${input.inviter} للانضمام إلى لوحة تحكم Hantex Ultra بدور «${input.roleAr}» ${whereAr}.`,
        `افتح الرابط التالي خلال ${input.hours} ساعة لإعداد مفتاح المرور على جهازك:`,
        input.link,
        'إن لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة.',
      ],
      [
        `${input.inviter} invited you to the Hantex Ultra dashboard as ${input.roleEn} ${whereEn}.`,
        `Open this link within ${input.hours} hours to set up a passkey on your device:`,
        input.link,
        "If you weren't expecting this invitation, ignore this email.",
      ],
    );
  },
  recoveryCode(input: { code: string; minutes: number }) {
    return bilingual(
      'رمز استعادة الوصول — Hantex Ultra access recovery code',
      [
        `رمز استعادة الوصول: ${input.code}`,
        `صالح لمدة ${input.minutes} دقائق، ويلزم معه أحد رموز الاسترداد الخاصة بك.`,
        'إن لم تطلب هذا الرمز فتجاهل الرسالة وأبلغ مدير النظام.',
      ],
      [
        `Your access recovery code: ${input.code}`,
        `It is valid for ${input.minutes} minutes and must be used with one of your recovery codes.`,
        "If you didn't ask for this, ignore this email and tell your administrator.",
      ],
    );
  },
  staffChange(input: { actor: string; summaryAr: string; summaryEn: string }) {
    return bilingual(
      'تغيير في فريق لوحة التحكم — Dashboard staff change',
      [
        `أجرى ${input.actor} التغيير التالي: ${input.summaryAr}`,
        'يمكنك مراجعة التفاصيل في سجل التدقيق.',
      ],
      [`${input.actor} made this change: ${input.summaryEn}`, 'See the audit log for details.'],
    );
  },
};
