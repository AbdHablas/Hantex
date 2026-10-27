import { z } from 'zod';
import {
  ICONS,
  bilingual,
  imageRefSchema,
  emptyText,
  itemId,
  linkSchema,
  slugSchema,
  type Bilingual,
} from './primitives';
import { emptyRichDoc, richDocSchema } from './richtext';

/**
 * The section registry (D-035): every section a page can contain is defined here once, with its
 * validated settings, its defaults and the fields the dashboard shows. The sites render each type
 * with their own component (apps/web/src/sections). Pages store only `{ type, settings }` data;
 * there is no free HTML, CSS or script.
 */

/* --------------------------------------- Shared parts --------------------------------------- */

const buttonSchema = z.strictObject({ label: bilingual(40), link: linkSchema });
export type Button = z.infer<typeof buttonSchema>;
const noButton = (): Button => ({ label: emptyText(), link: { type: 'none' } });

/** Appearance every section has, chosen from the theme's tokens only. */
export const sectionStyleSchema = z.strictObject({
  background: z.enum(['none', 'surface', 'muted', 'accent', 'inverse']),
  spacing: z.enum(['compact', 'normal', 'spacious']),
  width: z.enum(['narrow', 'normal', 'wide']),
  align: z.enum(['start', 'center']),
});
export type SectionStyle = z.infer<typeof sectionStyleSchema>;

/** Which screen sizes show the section (phone < 768px, tablet < 1024px, desktop). */
export const visibilitySchema = z.strictObject({
  mobile: z.boolean(),
  tablet: z.boolean(),
  desktop: z.boolean(),
});
export type Visibility = z.infer<typeof visibilitySchema>;

/* ------------------------------------ Dashboard field kinds ------------------------------------ */

export type Field =
  | { kind: 'text'; key: string; label: Bilingual; max: number; multiline?: boolean }
  /** One value for both languages, e.g. a figure or a model number. */
  | { kind: 'plain'; key: string; label: Bilingual; max: number }
  | { kind: 'rich'; key: string; label: Bilingual }
  | { kind: 'button'; key: string; label: Bilingual }
  | { kind: 'link'; key: string; label: Bilingual }
  | { kind: 'icon'; key: string; label: Bilingual }
  | { kind: 'toggle'; key: string; label: Bilingual }
  /** One image from the website's media library. */
  | { kind: 'image'; key: string; label: Bilingual }
  | {
      kind: 'select';
      key: string;
      label: Bilingual;
      options: { value: string | number; label: Bilingual }[];
    }
  | {
      kind: 'list';
      key: string;
      label: Bilingual;
      itemLabel: Bilingual;
      min: number;
      max: number;
      fields: Field[];
      newItem: () => Record<string, unknown>;
    };

const L = (en: string, ar: string): Bilingual => ({ en, ar });

const titleField: Field = { kind: 'text', key: 'title', label: L('Title', 'العنوان'), max: 120 };
const introField: Field = {
  kind: 'text',
  key: 'intro',
  label: L('Introduction', 'مقدمة'),
  max: 400,
  multiline: true,
};
const columnsField: Field = {
  kind: 'select',
  key: 'columns',
  label: L('Columns on large screens', 'الأعمدة على الشاشات الكبيرة'),
  options: [2, 3, 4].map((n) => ({ value: n, label: L(String(n), String(n)) })),
};

/* ----------------------------------------- Sections ----------------------------------------- */

const heroSchema = z.strictObject({
  eyebrow: bilingual(60),
  heading: bilingual(120),
  text: bilingual(400),
  primary: buttonSchema,
  secondary: buttonSchema,
});

const richTextSchema = z.strictObject({
  title: bilingual(120),
  body: z.strictObject({ ar: richDocSchema, en: richDocSchema }),
});

const featureItem = z.strictObject({
  id: itemId,
  icon: z.enum(ICONS),
  title: bilingual(80),
  text: bilingual(300),
});
const featuresSchema = z.strictObject({
  title: bilingual(120),
  intro: bilingual(400),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  items: z.array(featureItem).min(1).max(12),
});

const cardItem = z.strictObject({
  id: itemId,
  icon: z.enum(ICONS),
  title: bilingual(80),
  text: bilingual(200),
  link: linkSchema,
});
const cardsSchema = z.strictObject({
  title: bilingual(120),
  intro: bilingual(400),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  items: z.array(cardItem).min(1).max(12),
});

const ctaSchema = z.strictObject({
  heading: bilingual(120),
  text: bilingual(300),
  button: buttonSchema,
});

const faqItem = z.strictObject({ id: itemId, question: bilingual(200), answer: bilingual(1500) });
const faqSchema = z.strictObject({
  title: bilingual(120),
  items: z.array(faqItem).min(1).max(30),
});

const statItem = z.strictObject({
  id: itemId,
  value: z.string().trim().max(20),
  label: bilingual(80),
});
const statsSchema = z.strictObject({
  title: bilingual(120),
  items: z.array(statItem).min(1).max(6),
});

const contactSchema = z.strictObject({
  title: bilingual(120),
  text: bilingual(300),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showWhatsapp: z.boolean(),
  showAddress: z.boolean(),
  showHours: z.boolean(),
  showMap: z.boolean(),
});

const newsletterSchema = z.strictObject({
  title: bilingual(120),
  text: bilingual(300),
});

const dividerSchema = z.strictObject({ style: z.enum(['line', 'space']) });

const imageSchema = z.strictObject({
  image: imageRefSchema,
  caption: bilingual(200),
  link: linkSchema,
});

const imageTextSchema = z.strictObject({
  image: imageRefSchema,
  title: bilingual(120),
  text: bilingual(800),
  button: buttonSchema,
  /** Which side the image is on, in the page's reading direction. */
  imageSide: z.enum(['start', 'end']),
});

const galleryItem = z.strictObject({ id: itemId, image: imageRefSchema, caption: bilingual(200) });
const gallerySchema = z.strictObject({
  title: bilingual(120),
  intro: bilingual(400),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  items: z.array(galleryItem).min(1).max(24),
});

const id = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

export const SECTION_TYPES = [
  'hero',
  'richText',
  'image',
  'imageText',
  'gallery',
  'features',
  'cards',
  'cta',
  'faq',
  'stats',
  'contact',
  'newsletter',
  'divider',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

interface Definition<S extends z.ZodType> {
  name: Bilingual;
  description: Bilingual;
  /** lucide-react icon name for the dashboard's section picker. */
  icon: string;
  category: 'intro' | 'content' | 'engage' | 'layout';
  schema: S;
  defaults: () => z.infer<S>;
  fields: Field[];
}

const define = <S extends z.ZodType>(d: Definition<S>) => d;

export const SECTIONS = {
  hero: define({
    name: L('Hero banner', 'لافتة رئيسية'),
    description: L('A large heading with text and buttons.', 'عنوان كبير مع نص وأزرار.'),
    icon: 'PanelTop',
    category: 'intro',
    schema: heroSchema,
    defaults: () => ({
      eyebrow: emptyText(),
      heading: emptyText(),
      text: emptyText(),
      primary: noButton(),
      secondary: noButton(),
    }),
    fields: [
      {
        kind: 'text',
        key: 'eyebrow',
        label: L('Small label above', 'تسمية صغيرة فوق العنوان'),
        max: 60,
      },
      { kind: 'text', key: 'heading', label: L('Heading', 'العنوان'), max: 120 },
      { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 400, multiline: true },
      { kind: 'button', key: 'primary', label: L('Main button', 'الزر الرئيسي') },
      { kind: 'button', key: 'secondary', label: L('Second button', 'الزر الثاني') },
    ],
  }),
  richText: define({
    name: L('Text', 'نص'),
    description: L('Paragraphs, headings, lists and links.', 'فقرات وعناوين وقوائم وروابط.'),
    icon: 'AlignLeft',
    category: 'content',
    schema: richTextSchema,
    defaults: () => ({ title: emptyText(), body: { ar: emptyRichDoc(), en: emptyRichDoc() } }),
    fields: [titleField, { kind: 'rich', key: 'body', label: L('Text', 'النص') }],
  }),
  image: define({
    name: L('Image', 'صورة'),
    description: L('One image with a caption.', 'صورة واحدة مع تعليق.'),
    icon: 'Image',
    category: 'content',
    schema: imageSchema,
    defaults: () => ({ image: null, caption: emptyText(), link: { type: 'none' as const } }),
    fields: [
      { kind: 'image', key: 'image', label: L('Image', 'الصورة') },
      { kind: 'text', key: 'caption', label: L('Caption', 'التعليق'), max: 200 },
      { kind: 'link', key: 'link', label: L('Link', 'الرابط') },
    ],
  }),
  imageText: define({
    name: L('Image and text', 'صورة ونص'),
    description: L('An image beside a heading, text and a button.', 'صورة بجانب عنوان ونص وزر.'),
    icon: 'PanelLeft',
    category: 'content',
    schema: imageTextSchema,
    defaults: () => ({
      image: null,
      title: emptyText(),
      text: emptyText(),
      button: noButton(),
      imageSide: 'start' as const,
    }),
    fields: [
      { kind: 'image', key: 'image', label: L('Image', 'الصورة') },
      titleField,
      { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 800, multiline: true },
      { kind: 'button', key: 'button', label: L('Button', 'الزر') },
      {
        kind: 'select',
        key: 'imageSide',
        label: L('Image side', 'جهة الصورة'),
        options: [
          { value: 'start', label: L('Before the text', 'قبل النص') },
          { value: 'end', label: L('After the text', 'بعد النص') },
        ],
      },
    ],
  }),
  gallery: define({
    name: L('Gallery', 'معرض صور'),
    description: L('A grid of images with captions.', 'شبكة صور مع تعليقات.'),
    icon: 'Images',
    category: 'content',
    schema: gallerySchema,
    defaults: () => ({
      title: emptyText(),
      intro: emptyText(),
      columns: 3 as const,
      items: [{ id: id(), image: null, caption: emptyText() }],
    }),
    fields: [
      titleField,
      introField,
      columnsField,
      {
        kind: 'list',
        key: 'items',
        label: L('Images', 'الصور'),
        itemLabel: L('Image', 'صورة'),
        min: 1,
        max: 24,
        newItem: () => ({ id: id(), image: null, caption: emptyText() }),
        fields: [
          { kind: 'image', key: 'image', label: L('Image', 'الصورة') },
          { kind: 'text', key: 'caption', label: L('Caption', 'التعليق'), max: 200 },
        ],
      },
    ],
  }),
  features: define({
    name: L('Features', 'المزايا'),
    description: L('Short points with icons.', 'نقاط قصيرة مع أيقونات.'),
    icon: 'Sparkles',
    category: 'content',
    schema: featuresSchema,
    defaults: () => ({
      title: emptyText(),
      intro: emptyText(),
      columns: 3 as const,
      items: [{ id: id(), icon: 'check' as const, title: emptyText(), text: emptyText() }],
    }),
    fields: [
      titleField,
      introField,
      columnsField,
      {
        kind: 'list',
        key: 'items',
        label: L('Points', 'النقاط'),
        itemLabel: L('Point', 'نقطة'),
        min: 1,
        max: 12,
        newItem: () => ({ id: id(), icon: 'check', title: emptyText(), text: emptyText() }),
        fields: [
          { kind: 'icon', key: 'icon', label: L('Icon', 'الأيقونة') },
          { kind: 'text', key: 'title', label: L('Title', 'العنوان'), max: 80 },
          { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 300, multiline: true },
        ],
      },
    ],
  }),
  cards: define({
    name: L('Cards', 'بطاقات'),
    description: L(
      'Linked cards, e.g. product categories or pages.',
      'بطاقات بروابط، مثل فئات المنتجات أو الصفحات.',
    ),
    icon: 'LayoutGrid',
    category: 'content',
    schema: cardsSchema,
    defaults: () => ({
      title: emptyText(),
      intro: emptyText(),
      columns: 3 as const,
      items: [
        {
          id: id(),
          icon: 'other' as const,
          title: emptyText(),
          text: emptyText(),
          link: { type: 'none' as const },
        },
      ],
    }),
    fields: [
      titleField,
      introField,
      columnsField,
      {
        kind: 'list',
        key: 'items',
        label: L('Cards', 'البطاقات'),
        itemLabel: L('Card', 'بطاقة'),
        min: 1,
        max: 12,
        newItem: () => ({
          id: id(),
          icon: 'other',
          title: emptyText(),
          text: emptyText(),
          link: { type: 'none' },
        }),
        fields: [
          { kind: 'icon', key: 'icon', label: L('Icon', 'الأيقونة') },
          { kind: 'text', key: 'title', label: L('Title', 'العنوان'), max: 80 },
          { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 200, multiline: true },
          { kind: 'link', key: 'link', label: L('Link', 'الرابط') },
        ],
      },
    ],
  }),
  cta: define({
    name: L('Call to action', 'دعوة لاتخاذ إجراء'),
    description: L('A short message with one button.', 'رسالة قصيرة مع زر واحد.'),
    icon: 'MousePointerClick',
    category: 'engage',
    schema: ctaSchema,
    defaults: () => ({ heading: emptyText(), text: emptyText(), button: noButton() }),
    fields: [
      { kind: 'text', key: 'heading', label: L('Heading', 'العنوان'), max: 120 },
      { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 300, multiline: true },
      { kind: 'button', key: 'button', label: L('Button', 'الزر') },
    ],
  }),
  faq: define({
    name: L('Questions and answers', 'أسئلة وأجوبة'),
    description: L('Expandable questions.', 'أسئلة قابلة للتوسيع.'),
    icon: 'CircleHelp',
    category: 'content',
    schema: faqSchema,
    defaults: () => ({
      title: emptyText(),
      items: [{ id: id(), question: emptyText(), answer: emptyText() }],
    }),
    fields: [
      titleField,
      {
        kind: 'list',
        key: 'items',
        label: L('Questions', 'الأسئلة'),
        itemLabel: L('Question', 'سؤال'),
        min: 1,
        max: 30,
        newItem: () => ({ id: id(), question: emptyText(), answer: emptyText() }),
        fields: [
          { kind: 'text', key: 'question', label: L('Question', 'السؤال'), max: 200 },
          { kind: 'text', key: 'answer', label: L('Answer', 'الجواب'), max: 1500, multiline: true },
        ],
      },
    ],
  }),
  stats: define({
    name: L('Figures', 'أرقام'),
    description: L('A few figures you provide, with labels.', 'أرقام تُدخلها بنفسك مع تسمياتها.'),
    icon: 'ChartNoAxesColumn',
    category: 'content',
    schema: statsSchema,
    defaults: () => ({ title: emptyText(), items: [{ id: id(), value: '', label: emptyText() }] }),
    fields: [
      titleField,
      {
        kind: 'list',
        key: 'items',
        label: L('Figures', 'الأرقام'),
        itemLabel: L('Figure', 'رقم'),
        min: 1,
        max: 6,
        newItem: () => ({ id: id(), value: '', label: emptyText() }),
        fields: [
          { kind: 'plain', key: 'value', label: L('Figure', 'الرقم'), max: 20 },
          { kind: 'text', key: 'label', label: L('Label', 'التسمية'), max: 80 },
        ],
      },
    ],
  }),
  contact: define({
    name: L('Contact details', 'بيانات التواصل'),
    description: L(
      'Contact details from Website settings → SEO & contact.',
      'بيانات التواصل من إعدادات الموقع ← البحث والتواصل.',
    ),
    icon: 'Contact',
    category: 'engage',
    schema: contactSchema,
    defaults: () => ({
      title: emptyText(),
      text: emptyText(),
      showEmail: true,
      showPhone: true,
      showWhatsapp: true,
      showAddress: true,
      showHours: true,
      showMap: true,
    }),
    fields: [
      titleField,
      { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 300, multiline: true },
      { kind: 'toggle', key: 'showEmail', label: L('Email', 'البريد الإلكتروني') },
      { kind: 'toggle', key: 'showPhone', label: L('Phone', 'الهاتف') },
      { kind: 'toggle', key: 'showWhatsapp', label: L('WhatsApp', 'واتساب') },
      { kind: 'toggle', key: 'showAddress', label: L('Address', 'العنوان') },
      { kind: 'toggle', key: 'showHours', label: L('Opening hours', 'ساعات العمل') },
      { kind: 'toggle', key: 'showMap', label: L('Map link', 'رابط الخريطة') },
    ],
  }),
  newsletter: define({
    name: L('Sign-up form', 'نموذج الاشتراك'),
    description: L(
      'Email or WhatsApp sign-up, with consent and the security check.',
      'اشتراك بالبريد أو واتساب مع الموافقة والتحقق الأمني.',
    ),
    icon: 'Mail',
    category: 'engage',
    schema: newsletterSchema,
    defaults: () => ({ title: emptyText(), text: emptyText() }),
    fields: [
      titleField,
      { kind: 'text', key: 'text', label: L('Text', 'النص'), max: 300, multiline: true },
    ],
  }),
  divider: define({
    name: L('Divider', 'فاصل'),
    description: L('A line or extra space between sections.', 'خط أو مسافة بين الأقسام.'),
    icon: 'SeparatorHorizontal',
    category: 'layout',
    schema: dividerSchema,
    defaults: () => ({ style: 'line' as const }),
    fields: [
      {
        kind: 'select',
        key: 'style',
        label: L('Style', 'النمط'),
        options: [
          { value: 'line', label: L('Line', 'خط') },
          { value: 'space', label: L('Space only', 'مسافة فقط') },
        ],
      },
    ],
  }),
} satisfies Record<SectionType, Definition<z.ZodType>>;

/* ---------------------------------------- Section data ---------------------------------------- */

const sectionBase = {
  id: itemId,
  style: sectionStyleSchema,
  visibility: visibilitySchema,
  /** Optional anchor so buttons and menus can link to this section. */
  anchor: z.union([z.literal(''), slugSchema]),
};

const variant = <T extends SectionType | 'saved', S extends z.ZodType>(type: T, settings: S) =>
  z.strictObject({ ...sectionBase, type: z.literal(type), settings });

const contentVariants = [
  variant('hero', heroSchema),
  variant('richText', richTextSchema),
  variant('image', imageSchema),
  variant('imageText', imageTextSchema),
  variant('gallery', gallerySchema),
  variant('features', featuresSchema),
  variant('cards', cardsSchema),
  variant('cta', ctaSchema),
  variant('faq', faqSchema),
  variant('stats', statsSchema),
  variant('contact', contactSchema),
  variant('newsletter', newsletterSchema),
  variant('divider', dividerSchema),
] as const;

/** A section with its own content: one of the registered types. */
export const contentSectionSchema = z.discriminatedUnion('type', [...contentVariants]);
export type ContentSection = z.infer<typeof contentSectionSchema>;
export type SectionOf<T extends SectionType> = Extract<ContentSection, { type: T }>;

/**
 * A reusable section (D-038): the page holds only a reference to one of the website's saved
 * sections, so editing that saved section changes every page of this website that uses it.
 * Its own style and visibility are not used; the saved section's are.
 */
export const savedReferenceSchema = variant('saved', z.strictObject({ savedId: itemId }));
export type SavedReference = z.infer<typeof savedReferenceSchema>;

/** Anything a page can hold: a section, or a reference to a saved section. */
export const sectionSchema = z.discriminatedUnion('type', [
  ...contentVariants,
  savedReferenceSchema,
]);
export type Section = z.infer<typeof sectionSchema>;

/** A reference to a saved section, shown on every screen size (the saved section decides). */
export function savedReference(savedId: string, sectionId: string = id()): SavedReference {
  return {
    id: sectionId,
    type: 'saved',
    style: DEFAULT_STYLE,
    visibility: { mobile: true, tablet: true, desktop: true },
    anchor: '',
    settings: { savedId },
  };
}

export const DEFAULT_STYLE: SectionStyle = {
  background: 'none',
  spacing: 'normal',
  width: 'normal',
  align: 'start',
};

/** A new section of a type, with its defaults, visible on every screen size. */
export function newSection<T extends SectionType>(type: T, sectionId: string = id()): SectionOf<T> {
  return {
    id: sectionId,
    type,
    style:
      type === 'hero' || type === 'cta' ? { ...DEFAULT_STYLE, align: 'center' } : DEFAULT_STYLE,
    visibility: { mobile: true, tablet: true, desktop: true },
    anchor: '',
    settings: SECTIONS[type].defaults(),
  } as SectionOf<T>;
}

/** A fresh identifier for pages, sections and list items. */
export const newId = id;
