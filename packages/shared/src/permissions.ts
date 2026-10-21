import type { Bilingual } from './i18n';

export interface PermissionDefinition {
  label: Bilingual;
  group: 'overview' | 'content' | 'customers' | 'appearance' | 'staff' | 'site';
  /** Shown as a warning label in the roles matrix. */
  sensitive?: 'personal-data' | 'destructive' | 'brand';
  /** Owner-only: can never be given to another role (docs/roles-and-permissions.md). */
  reserved?: true;
}

/**
 * Every permission the server checks. Permissions are defined in code because each one matches a
 * server-side check; roles (bundles of permissions) are data, editable in the dashboard (D-019).
 */
export const PERMISSIONS = {
  'dashboard.view': {
    group: 'overview',
    label: { en: 'View the dashboard overview and statistics', ar: 'عرض النظرة العامة والإحصاءات' },
  },
  'comingSoon.view': {
    group: 'content',
    label: { en: 'View Coming Soon content', ar: 'عرض محتوى صفحة الإطلاق' },
  },
  'comingSoon.edit': {
    group: 'content',
    label: { en: 'Edit Coming Soon drafts', ar: 'تعديل مسودات صفحة الإطلاق' },
  },
  'site.publish': {
    group: 'content',
    label: { en: 'Publish changes to the public website', ar: 'نشر التغييرات على الموقع العام' },
  },
  'settings.view': {
    group: 'site',
    label: { en: 'View site settings', ar: 'عرض إعدادات الموقع' },
  },
  'settings.edit': {
    group: 'site',
    label: {
      en: 'Edit site settings (contact details, social links, SEO)',
      ar: 'تعديل إعدادات الموقع (التواصل والروابط وتحسين الظهور)',
    },
  },
  'subscribers.view': {
    group: 'customers',
    sensitive: 'personal-data',
    label: { en: 'View launch sign-ups', ar: 'عرض المشتركين في إشعار الإطلاق' },
  },
  'subscribers.export': {
    group: 'customers',
    sensitive: 'personal-data',
    label: { en: 'Export launch sign-ups', ar: 'تصدير قائمة المشتركين' },
  },
  'subscribers.delete': {
    group: 'customers',
    sensitive: 'destructive',
    label: { en: 'Delete launch sign-ups', ar: 'حذف المشتركين' },
  },
  'appearance.edit': {
    group: 'appearance',
    label: { en: 'Edit theme drafts', ar: 'تعديل مسودات المظهر' },
  },
  'appearance.publish': {
    group: 'appearance',
    label: { en: 'Publish or roll back the theme', ar: 'نشر المظهر أو استرجاع نسخة سابقة' },
  },
  'appearance.editLogo': {
    group: 'appearance',
    sensitive: 'brand',
    label: {
      en: 'Edit logo colours (departs from brand guidelines)',
      ar: 'تعديل ألوان الشعار (خروج عن دليل الهوية)',
    },
  },
  'staff.view': {
    group: 'staff',
    label: { en: 'View staff accounts', ar: 'عرض حسابات الفريق' },
  },
  'staff.manage': {
    group: 'staff',
    label: {
      en: 'Invite and disable staff (below Administrator)',
      ar: 'دعوة أعضاء الفريق وتعطيلهم (دون مستوى المدير)',
    },
  },
  'staff.manageAdmins': {
    group: 'staff',
    reserved: true,
    label: { en: 'Manage Owners and Administrators', ar: 'إدارة المالكين والمديرين' },
  },
  'roles.manage': {
    group: 'staff',
    reserved: true,
    label: { en: 'Create and edit roles', ar: 'إنشاء الأدوار وتعديلها' },
  },
  'audit.view': {
    group: 'staff',
    label: { en: 'View the audit log', ar: 'عرض سجل التدقيق' },
  },
  'siteMode.manage': {
    group: 'site',
    reserved: true,
    label: {
      en: 'Switch the site between Coming Soon, maintenance and live',
      ar: 'تبديل وضع الموقع (قريباً، صيانة، منشور)',
    },
  },
  'security.manage': {
    group: 'site',
    reserved: true,
    label: { en: 'Change security settings', ar: 'تغيير إعدادات الأمان' },
  },
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const RESERVED_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => (PERMISSIONS[p] as PermissionDefinition).reserved === true,
);

export const isPermission = (value: string): value is Permission =>
  Object.hasOwn(PERMISSIONS, value);

export interface StandardRole {
  id: string;
  name: Bilingual;
  description: Bilingual;
  permissions: readonly Permission[];
  /** Assigning or changing holders of this role needs staff.manageAdmins. */
  protected: boolean;
  /** The role's permissions cannot be edited. */
  locked: boolean;
}

/** The six standard roles (D-019), as approved in docs/roles-and-permissions.md. */
export const STANDARD_ROLES: readonly StandardRole[] = [
  {
    id: 'owner',
    name: { en: 'Owner', ar: 'المالك' },
    description: {
      en: 'Full control, including staff, roles and going live.',
      ar: 'تحكم كامل يشمل الفريق والأدوار وإطلاق الموقع.',
    },
    permissions: ALL_PERMISSIONS,
    protected: true,
    locked: true,
  },
  {
    id: 'administrator',
    name: { en: 'Administrator', ar: 'المدير' },
    description: { en: 'Runs the site day to day.', ar: 'يدير الموقع يوميًا.' },
    permissions: [
      'dashboard.view',
      'comingSoon.view',
      'comingSoon.edit',
      'site.publish',
      'settings.view',
      'settings.edit',
      'subscribers.view',
      'subscribers.export',
      'subscribers.delete',
      'appearance.edit',
      'appearance.publish',
      'staff.view',
      'staff.manage',
      'audit.view',
    ],
    protected: true,
    locked: false,
  },
  {
    id: 'content-manager',
    name: { en: 'Content Manager', ar: 'مدير المحتوى' },
    description: { en: 'Updates and publishes website content.', ar: 'يحدّث محتوى الموقع وينشره.' },
    permissions: [
      'dashboard.view',
      'comingSoon.view',
      'comingSoon.edit',
      'site.publish',
      'settings.view',
    ],
    protected: false,
    locked: false,
  },
  {
    id: 'sales',
    name: { en: 'Sales & Enquiries', ar: 'المبيعات والاستفسارات' },
    description: { en: 'Follows up sign-ups and enquiries.', ar: 'يتابع المشتركين والاستفسارات.' },
    permissions: [
      'dashboard.view',
      'comingSoon.view',
      'settings.view',
      'subscribers.view',
      'subscribers.export',
    ],
    protected: false,
    locked: false,
  },
  {
    id: 'editor',
    name: { en: 'Editor', ar: 'المحرر' },
    description: {
      en: 'Prepares drafts; someone else publishes.',
      ar: 'يجهّز المسودات وينشرها شخص آخر.',
    },
    permissions: ['dashboard.view', 'comingSoon.view', 'comingSoon.edit'],
    protected: false,
    locked: false,
  },
  {
    id: 'viewer',
    name: { en: 'Viewer', ar: 'المشاهد' },
    description: {
      en: 'Read-only; never sees customer personal data.',
      ar: 'قراءة فقط، دون الاطلاع على بيانات العملاء.',
    },
    permissions: ['dashboard.view', 'comingSoon.view', 'settings.view'],
    protected: false,
    locked: false,
  },
];

export function permissionsOf(standardRoleId: string): Set<Permission> {
  const role = STANDARD_ROLES.find((r) => r.id === standardRoleId);
  if (!role) throw new Error(`Unknown standard role "${standardRoleId}"`);
  return new Set(role.permissions);
}
