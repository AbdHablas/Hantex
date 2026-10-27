import { emptyText, type Bilingual } from './primitives';
import { newSection } from './registry';
import type { RichDoc } from './richtext';
import { newPage, type Page } from './site';

/**
 * A privacy policy draft (D-041) describing only what the platform actually does: the sign-up
 * form, the security check, abuse protection, optional cookieless statistics, the services
 * involved, retention and visitors' rights. Facts only the owner knows are left as
 * [bracketed placeholders]. It is not legal advice: the page starts hidden, opens with a notice
 * to remove after review, and goes live only when the owner shows and publishes it.
 */

type Block = { h: string } | { p: string } | { list: string[] };

function doc(blocks: Block[]): RichDoc {
  const text = (value: string) => [{ type: 'text' as const, text: value }];
  return {
    type: 'doc',
    content: blocks.map((block) =>
      'h' in block
        ? { type: 'heading' as const, attrs: { level: 2 as const }, content: text(block.h) }
        : 'p' in block
          ? { type: 'paragraph' as const, content: text(block.p) }
          : {
              type: 'bulletList' as const,
              content: block.list.map((item) => ({
                type: 'listItem' as const,
                content: [{ type: 'paragraph' as const, content: text(item) }],
              })),
            },
    ),
  };
}

const en = (site: string): Block[] => [
  {
    p: 'DRAFT FOR REVIEW — not legal advice. Check every statement, fill in the [bracketed] details, then delete this paragraph before showing the page.',
  },
  { p: 'Last updated: [date].' },
  { h: 'Who we are' },
  {
    p: `${site} is run by [company legal name], [address]. For any question about your data, write to [privacy contact email].`,
  },
  { h: 'What we collect' },
  {
    list: [
      'When you sign up for news: your email address or WhatsApp number, the language you used, the date, and which version of the consent text you agreed to.',
      'To stop automated sign-ups, Cloudflare Turnstile checks that the form is sent by a person. Cloudflare processes technical information about your connection and browser for this check.',
      'To limit repeated attempts, we keep a counter linked to a one-way code made from your IP address. Your IP address itself is not stored.',
      'If statistics are switched on, Cloudflare Web Analytics counts page views without cookies and without identifying you.',
    ],
  },
  {
    p: 'This website sets no cookies of its own. If you choose the light or dark look, that choice is kept in your own browser only.',
  },
  { h: 'Why we use it' },
  {
    p: 'Only to send you the news you asked for, such as our launch, and to keep the website secure. We do not sell your data or use it for advertising.',
  },
  { h: 'Services we use' },
  {
    list: [
      'Cloudflare: hosting this website, the security check and, if switched on, the statistics.',
      'Neon: our database, in [region].',
      'Resend: sending our emails, when we email you.',
      'WhatsApp: if you gave a WhatsApp number, we message you from our business account.',
      'YouTube or Vimeo: only on pages with a video, and only after you press play. From then on, the video service receives technical information about your connection and may store data in your browser, under its own privacy policy.',
    ],
  },
  { h: 'How long we keep it' },
  {
    p: 'We keep your sign-up until you unsubscribe or ask us to delete it, or for at most [retention period]. Encrypted backups of our database are deleted after [30] days, and monthly backups after [12] months.',
  },
  { h: 'Your choices and rights' },
  {
    list: [
      'Every email we send has a link to unsubscribe at once.',
      'You can ask us to show, correct or delete your data at any time by writing to [privacy contact email].',
      '[Add any rights or authorities that apply where you operate.]',
    ],
  },
  { h: 'Changes' },
  { p: 'If we change this policy, we will update the date above.' },
];

const ar = (site: string): Block[] => [
  {
    p: 'مسودة للمراجعة — وليست استشارة قانونية. تحقّق من كل عبارة، واملأ التفاصيل بين [القوسين]، ثم احذف هذه الفقرة قبل إظهار الصفحة.',
  },
  { p: 'آخر تحديث: [التاريخ].' },
  { h: 'من نحن' },
  {
    p: `يدير ${site} [الاسم القانوني للشركة]، [العنوان]. لأي سؤال عن بياناتك، راسلنا على [بريد التواصل بشأن الخصوصية].`,
  },
  { h: 'ما الذي نجمعه' },
  {
    list: [
      'عند اشتراكك لتلقي الأخبار: بريدك الإلكتروني أو رقم واتساب، واللغة التي استخدمتها، والتاريخ، ونسخة نص الموافقة التي وافقت عليها.',
      'لمنع الاشتراكات الآلية، تتحقق خدمة Cloudflare Turnstile من أن النموذج يرسله شخص. تعالج Cloudflare معلومات تقنية عن اتصالك ومتصفحك لهذا التحقق.',
      'للحد من المحاولات المتكررة، نحتفظ بعدّاد مرتبط برمز أحادي الاتجاه مأخوذ من عنوان IP الخاص بك. لا نخزّن عنوان IP نفسه.',
      'إذا كانت الإحصاءات مفعّلة، تحسب Cloudflare Web Analytics زيارات الصفحات دون ملفات تعريف الارتباط ودون التعرّف عليك.',
    ],
  },
  {
    p: 'لا يضع هذا الموقع ملفات تعريف ارتباط خاصة به. إذا اخترت الوضع الفاتح أو الداكن، يُحفظ اختيارك في متصفحك أنت فقط.',
  },
  { h: 'لماذا نستخدمها' },
  {
    p: 'فقط لإرسال الأخبار التي طلبتها، مثل موعد الإطلاق، وللحفاظ على أمان الموقع. لا نبيع بياناتك ولا نستخدمها للإعلانات.',
  },
  { h: 'الخدمات التي نستخدمها' },
  {
    list: [
      'Cloudflare: استضافة هذا الموقع والتحقق الأمني، والإحصاءات إذا كانت مفعّلة.',
      'Neon: قاعدة بياناتنا، في [المنطقة].',
      'Resend: إرسال رسائلنا البريدية عندما نراسلك.',
      'واتساب: إذا أعطيتنا رقم واتساب، نراسلك من حسابنا التجاري.',
      'يوتيوب أو فيميو: في الصفحات التي فيها فيديو فقط، وبعد أن تضغط على التشغيل فقط. عندها تتلقى خدمة الفيديو معلومات تقنية عن اتصالك وقد تخزّن بيانات في متصفحك، وفق سياسة الخصوصية الخاصة بها.',
    ],
  },
  { h: 'مدة الاحتفاظ' },
  {
    p: 'نحتفظ باشتراكك حتى تلغيه أو تطلب حذفه، أو لمدة أقصاها [مدة الاحتفاظ]. تُحذف النسخ الاحتياطية المشفّرة لقاعدة بياناتنا بعد [30] يومًا، والنسخ الشهرية بعد [12] شهرًا.',
  },
  { h: 'خياراتك وحقوقك' },
  {
    list: [
      'كل رسالة بريدية نرسلها فيها رابط لإلغاء الاشتراك فورًا.',
      'يمكنك أن تطلب منا عرض بياناتك أو تصحيحها أو حذفها في أي وقت بمراسلة [بريد التواصل بشأن الخصوصية].',
      '[أضف أي حقوق أو جهات مختصة تنطبق في بلد عملك.]',
    ],
  },
  { h: 'التغييرات' },
  { p: 'إذا غيّرنا هذه السياسة، سنحدّث التاريخ أعلاه.' },
];

/** A hidden "Privacy policy" page with the draft in both languages, for the owner to review. */
export function privacyPolicyDraft(siteName: Bilingual): Page {
  const section = newSection('richText');
  section.settings.title = emptyText();
  section.settings.body = {
    ar: doc(ar(siteName.ar || siteName.en)),
    en: doc(en(siteName.en || siteName.ar)),
  };
  section.style = { ...section.style, width: 'narrow' };
  return {
    ...newPage({ ar: 'سياسة الخصوصية', en: 'Privacy policy' }, 'privacy'),
    // Never public by accident: the owner shows it after review.
    visible: false,
    seo: { title: emptyText(), description: emptyText(), noindex: false },
    sections: [section],
  };
}
