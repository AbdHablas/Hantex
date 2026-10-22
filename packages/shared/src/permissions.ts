import type { Bilingual } from './i18n';

export interface PermissionDefinition {
  label: Bilingual;
  group: 'overview' | 'content' | 'customers' | 'appearance' | 'staff' | 'site' | 'platform';
  /**
   * 'site' permissions apply on the sites a role assignment covers; 'platform' permissions apply
   * across the whole platform and only count from an all-sites assignment (D-025).
   */
  scope: 'site' | 'platform';
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
    scope: 'site',
    group: 'overview',
    label: { en: 'View the dashboard overview and statistics', ar: 'عرض النظرة العامة والإحصاءات' },
  },
  'comingSoon.view': {
    scope: 'site',
    group: 'content',
    label: { en: 'View Coming Soon content', ar: 'عرض محتوى صفحة الإطلاق' },
  },
  'comingSoon.edit': {
    scope: 'site',
    group: 'content',
    label: { en: 'Edit Coming Soon drafts', ar: 'تعديل مسودات صفحة الإطلاق' },
  },
  'site.publish': {
    scope: 'site',
    group: 'content',
    label: { en: 'Publish changes to the public website', ar: 'نشر التغييرات على الموقع العام' },
  },
  'pages.view': {
    scope: 'site',
    group: 'content',
    label: { en: 'View pages, sections and menus', ar: 'عرض الصفحات والأقسام والقوائم' },
  },
  'pages.edit': {
    scope: 'site',
    group: 'content',
    label: {
      en: 'Edit pages, sections, menus, header and footer (drafts)',
      ar: 'تعديل الصفحات والأقسام والقوائم والترويسة والتذييل (مسودات)',
    },
  },
  'media.view': {
    scope: 'site',
    group: 'content',
    label: { en: 'View the media library', ar: 'عرض مكتبة الوسائط' },
  },
  'media.edit': {
    scope: 'site',
    group: 'content',
    label: { en: 'Upload and describe images', ar: 'رفع الصور ووصفها' },
  },
  'media.delete': {
    scope: 'site',
    group: 'content',
    sensitive: 'destructive',
    label: { en: 'Delete images from the media library', ar: 'حذف الصور من مكتبة الوسائط' },
  },
  'settings.view': {
    scope: 'site',
    group: 'site',
    label: { en: 'View site settings', ar: 'عرض إعدادات الموقع' },
  },
  'settings.edit': {
    scope: 'site',
    group: 'site',
    label: {
      en: 'Edit site settings (contact details, social links, SEO)',
      ar: 'تعديل إعدادات الموقع (التواصل والروابط وتحسين الظهور)',
    },
  },
  'subscribers.view': {
    scope: 'site',
    group: 'customers',
    sensitive: 'personal-data',
    label: { en: 'View launch sign-ups', ar: 'عرض المشتركين في إشعار الإطلاق' },
  },
  'subscribers.export': {
    scope: 'site',
    group: 'customers',
    sensitive: 'personal-data',
    label: { en: 'Export launch sign-ups', ar: 'تصدير قائمة المشتركين' },
  },
  'subscribers.delete': {
    scope: 'site',
    group: 'customers',
    sensitive: 'destructive',
    label: { en: 'Delete launch sign-ups', ar: 'حذف المشتركين' },
  },
  'subscribers.announce': {
    scope: 'site',
    group: 'customers',
    sensitive: 'personal-data',
    label: {
      en: 'Send announcements to email sign-ups',
      ar: 'إرسال إعلانات إلى المشتركين بالبريد',
    },
  },
  'appearance.edit': {
    scope: 'site',
    group: 'appearance',
    label: { en: 'Edit theme drafts', ar: 'تعديل مسودات المظهر' },
  },
  'appearance.publish': {
    scope: 'site',
    group: 'appearance',
    label: { en: 'Publish or roll back the theme', ar: 'نشر المظهر أو استرجاع نسخة سابقة' },
  },
  'appearance.editLogo': {
    scope: 'site',
    group: 'appearance',
    sensitive: 'brand',
    label: {
      en: 'Edit logo colours (departs from brand guidelines)',
      ar: 'تعديل ألوان الشعار (خروج عن دليل الهوية)',
    },
  },
  'staff.view': {
    scope: 'site',
    group: 'staff',
    label: { en: 'View staff accounts', ar: 'عرض حسابات الفريق' },
  },
  'staff.manage': {
    scope: 'site',
    group: 'staff',
    label: {
      en: 'Invite and disable staff (below Administrator)',
      ar: 'دعوة أعضاء الفريق وتعطيلهم (دون مستوى المدير)',
    },
  },
  'staff.manageAdmins': {
    scope: 'platform',
    group: 'staff',
    reserved: true,
    label: { en: 'Manage Owners and Administrators', ar: 'إدارة المالكين والمديرين' },
  },
  'roles.manage': {
    scope: 'platform',
    group: 'staff',
    reserved: true,
    label: { en: 'Create and edit roles', ar: 'إنشاء الأدوار وتعديلها' },
  },
  'audit.view': {
    scope: 'site',
    group: 'staff',
    label: { en: 'View the audit log', ar: 'عرض سجل التدقيق' },
  },
  'siteMode.manage': {
    scope: 'site',
    group: 'site',
    reserved: true,
    label: {
      en: 'Switch the site between Coming Soon, maintenance and live',
      ar: 'تبديل وضع الموقع (قريباً، صيانة، منشور)',
    },
  },
  'security.manage': {
    scope: 'platform',
    group: 'platform',
    reserved: true,
    label: { en: 'Change security settings', ar: 'تغيير إعدادات الأمان' },
  },
  'sites.manage': {
    scope: 'platform',
    group: 'platform',
    reserved: true,
    label: {
      en: 'Create and manage websites (domains, languages, archiving)',
      ar: 'إنشاء المواقع وإدارتها (النطاقات واللغات والأرشفة)',
    },
  },
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const RESERVED_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => (PERMISSIONS[p] as PermissionDefinition).reserved === true,
);

export const PLATFORM_PERMISSIONS = ALL_PERMISSIONS.filter(
  (p) => (PERMISSIONS[p] as PermissionDefinition).scope === 'platform',
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
      'pages.view',
      'pages.edit',
      'media.view',
      'media.edit',
      'media.delete',
      'comingSoon.view',
      'comingSoon.edit',
      'site.publish',
      'settings.view',
      'settings.edit',
      'subscribers.view',
      'subscribers.export',
      'subscribers.delete',
      'subscribers.announce',
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
      'pages.view',
      'pages.edit',
      'media.view',
      'media.edit',
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
      'pages.view',
      'media.view',
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
    permissions: [
      'dashboard.view',
      'pages.view',
      'pages.edit',
      'media.view',
      'media.edit',
      'comingSoon.view',
      'comingSoon.edit',
    ],
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
    permissions: ['dashboard.view', 'pages.view', 'media.view', 'comingSoon.view', 'settings.view'],
    protected: false,
    locked: false,
  },
];

export function permissionsOf(standardRoleId: string): Set<Permission> {
  const role = STANDARD_ROLES.find((r) => r.id === standardRoleId);
  if (!role) throw new Error(`Unknown standard role "${standardRoleId}"`);
  return new Set(role.permissions);
}
