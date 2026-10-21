import type { Locale } from '@hantex/shared';

/** Interface text for the public pages. Content itself comes from the dashboard. */
export const TEXT = {
  ar: {
    languageName: 'العربية',
    switchTo: 'English',
    themeToggle: 'تبديل الوضع الفاتح والداكن',
    countdown: {
      days: 'يوم',
      hours: 'ساعة',
      minutes: 'دقيقة',
      seconds: 'ثانية',
      label: 'الوقت المتبقي حتى الإطلاق',
    },
    milestones: 'المراحل',
    done: 'مُنجزة',
    progress: 'التقدّم',
    signupTitle: 'أعلمني عند الإطلاق',
    signupLabel: 'بريدك الإلكتروني أو رقم واتساب مع رمز الدولة',
    signupPlaceholder: 'name@example.com أو ‎+963…',
    consent:
      'أوافق على أن تتواصل معي {site} بخصوص الإطلاق عبر هذه البيانات. يمكنني طلب حذفها في أي وقت.',
    submit: 'أعلمني',
    sending: 'جارٍ الإرسال…',
    thanks: 'شكرًا لك! سنُعلمك عند الإطلاق.',
    errors: {
      'invalid-contact': 'أدخل بريدًا إلكترونيًا أو رقم واتساب صحيحًا.',
      'phone-needs-country-code': 'أضف رمز الدولة إلى الرقم، مثل ‎+963.',
      'consent-required': 'يلزم موافقتك لنتمكن من التواصل معك.',
      'captcha-failed': 'تعذّر التحقق الأمني. حاول مرة أخرى.',
      'rate-limited': 'محاولات كثيرة. حاول بعد قليل.',
      unavailable: 'الاشتراك غير متاح الآن. حاول لاحقًا.',
      'request-error': 'تعذّر الإرسال. حاول مرة أخرى.',
    } as Record<string, string>,
    contact: 'تواصل معنا',
    maintenanceTitle: 'الموقع قيد الصيانة',
    maintenanceText: 'نجري بعض التحسينات وسنعود قريبًا.',
    preview: 'معاينة مسودة — غير منشورة',
  },
  en: {
    languageName: 'English',
    switchTo: 'العربية',
    themeToggle: 'Switch between light and dark',
    countdown: {
      days: 'days',
      hours: 'hours',
      minutes: 'minutes',
      seconds: 'seconds',
      label: 'Time left until launch',
    },
    milestones: 'Milestones',
    done: 'Done',
    progress: 'Progress',
    signupTitle: 'Tell me when it launches',
    signupLabel: 'Your email, or WhatsApp number with country code',
    signupPlaceholder: 'name@example.com or +963…',
    consent:
      'I agree that {site} may contact me about its launch using these details. I can ask for them to be deleted at any time.',
    submit: 'Notify me',
    sending: 'Sending…',
    thanks: 'Thank you! We’ll let you know when we launch.',
    errors: {
      'invalid-contact': 'Enter a valid email address or WhatsApp number.',
      'phone-needs-country-code': 'Add the country code to the number, for example +963.',
      'consent-required': 'We need your agreement to contact you.',
      'captcha-failed': 'The security check failed. Please try again.',
      'rate-limited': 'Too many attempts. Please try again shortly.',
      unavailable: 'Sign-ups aren’t available right now. Please try later.',
      'request-error': 'Something went wrong. Please try again.',
    } as Record<string, string>,
    contact: 'Contact us',
    maintenanceTitle: 'We’re doing some maintenance',
    maintenanceText: 'We’re making a few improvements and will be back soon.',
    preview: 'Draft preview — not published',
  },
} satisfies Record<Locale, unknown>;

export const dirOf = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');
