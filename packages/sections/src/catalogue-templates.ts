import type { Attribute, AttributeGroup, AttributeType, Catalogue } from './catalogue';
import type { Bilingual } from './primitives';

/**
 * Optional starter attribute sets (D-045): suggested field *definitions* a website can add and
 * then rename or remove. They hold no values; every value is entered by the website's team.
 */

interface TemplateAttribute {
  group: string | null;
  name: Bilingual;
  type: AttributeType;
  unit?: string;
  choices?: Bilingual[];
  filterable?: boolean;
}

export interface AttributeTemplate {
  id: 'wall-plates' | 'lighting' | 'general';
  name: Bilingual;
  groups: Record<string, Bilingual>;
  attributes: TemplateAttribute[];
}

const GROUPS = {
  electrical: { ar: 'كهربائية', en: 'Electrical' },
  light: { ar: 'الإضاءة', en: 'Light' },
  dimensions: { ar: 'الأبعاد', en: 'Dimensions' },
  materials: { ar: 'المواد', en: 'Materials' },
  compliance: { ar: 'المطابقة', en: 'Compliance' },
};

const SIZE: TemplateAttribute[] = [
  { group: 'dimensions', name: { ar: 'العرض', en: 'Width' }, type: 'number', unit: 'mm' },
  { group: 'dimensions', name: { ar: 'الارتفاع', en: 'Height' }, type: 'number', unit: 'mm' },
  { group: 'dimensions', name: { ar: 'العمق', en: 'Depth' }, type: 'number', unit: 'mm' },
];
const IP: TemplateAttribute = {
  group: 'compliance',
  name: { ar: 'درجة الحماية IP', en: 'IP rating' },
  type: 'text',
  filterable: true,
};
const MATERIAL: TemplateAttribute = {
  group: 'materials',
  name: { ar: 'المادة', en: 'Material' },
  type: 'text',
};

export const ATTRIBUTE_TEMPLATES: readonly AttributeTemplate[] = [
  {
    id: 'wall-plates',
    name: { ar: 'المفاتيح والمقابس', en: 'Switches and sockets' },
    groups: GROUPS,
    attributes: [
      {
        group: 'electrical',
        name: { ar: 'عدد الخطوط (Gang)', en: 'Number of gangs' },
        type: 'number',
        filterable: true,
      },
      {
        group: 'electrical',
        name: { ar: 'طريقة التحكم', en: 'Switching' },
        type: 'choice',
        choices: [
          { ar: 'اتجاه واحد', en: 'One-way' },
          { ar: 'اتجاهان', en: 'Two-way' },
          { ar: 'وسطي', en: 'Intermediate' },
        ],
        filterable: true,
      },
      {
        group: 'electrical',
        name: { ar: 'التيار المقنن', en: 'Rated current' },
        type: 'number',
        unit: 'A',
        filterable: true,
      },
      {
        group: 'electrical',
        name: { ar: 'الجهد المقنن', en: 'Rated voltage' },
        type: 'number',
        unit: 'V',
      },
      { group: 'electrical', name: { ar: 'نوع الآلية', en: 'Mechanism type' }, type: 'text' },
      { group: 'electrical', name: { ar: 'معيار المقبس', en: 'Socket standard' }, type: 'text' },
      {
        group: 'electrical',
        name: { ar: 'غطاء أمان للفتحات', en: 'Shutters' },
        type: 'yes-no',
      },
      { group: 'electrical', name: { ar: 'منافذ USB', en: 'USB outlets' }, type: 'number' },
      ...SIZE,
      IP,
      MATERIAL,
    ],
  },
  {
    id: 'lighting',
    name: { ar: 'الإضاءة والمصابيح', en: 'Lighting and lamps' },
    groups: GROUPS,
    attributes: [
      {
        group: 'light',
        name: { ar: 'القدرة', en: 'Power' },
        type: 'number',
        unit: 'W',
        filterable: true,
      },
      {
        group: 'light',
        name: { ar: 'التدفق الضوئي', en: 'Luminous flux' },
        type: 'number',
        unit: 'lm',
      },
      {
        group: 'light',
        name: { ar: 'درجة حرارة اللون', en: 'Colour temperature' },
        type: 'number',
        unit: 'K',
        filterable: true,
      },
      {
        group: 'light',
        name: { ar: 'مؤشر تجسيد اللون (CRI)', en: 'Colour rendering (CRI)' },
        type: 'number',
      },
      { group: 'light', name: { ar: 'نوع القاعدة', en: 'Base or fitting' }, type: 'text' },
      {
        group: 'light',
        name: { ar: 'قابل للتعتيم', en: 'Dimmable' },
        type: 'yes-no',
        filterable: true,
      },
      {
        group: 'light',
        name: { ar: 'زاوية الحزمة', en: 'Beam angle' },
        type: 'number',
        unit: '°',
      },
      ...SIZE,
      IP,
      MATERIAL,
    ],
  },
  {
    id: 'general',
    name: { ar: 'منتج عام', en: 'General product' },
    groups: GROUPS,
    attributes: [
      ...SIZE,
      { group: 'dimensions', name: { ar: 'الوزن', en: 'Weight' }, type: 'number', unit: 'kg' },
      MATERIAL,
    ],
  },
];

type Structure = Pick<Catalogue, 'groups' | 'attributes'>;

/**
 * Adds a template's groups and attributes to a catalogue's structure, skipping any whose English
 * name the catalogue already has, so applying a template twice adds nothing.
 */
export function applyAttributeTemplate<T extends Structure>(
  structure: T,
  template: AttributeTemplate,
  newId: () => string,
): T & { added: string[] } {
  const same = (a: Bilingual, b: Bilingual) =>
    a.en.trim().toLowerCase() === b.en.trim().toLowerCase();
  const groups: AttributeGroup[] = [...structure.groups];
  const attributes: Attribute[] = [...structure.attributes];
  const added: string[] = [];
  const groupId = (key: string | null) => {
    if (key === null) return null;
    const name = template.groups[key];
    if (!name) return null;
    const existing = groups.find((g) => same(g.name, name));
    if (existing) return existing.id;
    const group = { id: newId(), name: { ...name } };
    groups.push(group);
    return group.id;
  };
  for (const item of template.attributes) {
    if (attributes.some((a) => same(a.name, item.name))) continue;
    const attribute: Attribute = {
      id: newId(),
      name: { ...item.name },
      groupId: groupId(item.group),
      type: item.type,
      unit: item.unit ?? '',
      choices: (item.choices ?? []).map((label) => ({ id: newId(), label: { ...label } })),
      filterable: item.filterable ?? false,
    };
    attributes.push(attribute);
    added.push(attribute.id);
  }
  return { ...structure, groups, attributes, added };
}
