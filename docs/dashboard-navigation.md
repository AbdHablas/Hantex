# Dashboard navigation

How the dashboard's menus are organised, and where new modules go. The single
source is [`apps/admin/src/lib/navigation.tsx`](../apps/admin/src/lib/navigation.tsx):
the sidebar, the mobile menu, the breadcrumbs and the Ctrl/⌘ + K command
palette are all built from it, so they always agree.

## Structure

```
[Website switcher: Hantex Ultra ▾]       ← chooses the website below applies to
  Overview
  CONTENT & DESIGN
    Coming Soon page
    Appearance
  AUDIENCE
    Sign-ups
  WEBSITE SETTINGS
    General            (details, domains, mode, archive)
    SEO & contact      (search engines, contact, social links, privacy note)
    Team               (staff on this website)
    Activity log       (this website's audit log)
──────────────────────
ADMINISTRATION · All websites
  Websites
  People               (all staff)
  Roles & permissions
  Audit log            (every website)
──────────────────────
[Account menu ▴]  My account · Sign out
```

- **Website sections** apply to the website chosen in the switcher.
  Switching keeps the same page when the other website has it (Appearance →
  Appearance), otherwise it opens that website's overview.
- **Administration** covers all websites and sits apart, at the foot of the
  sidebar.
- **Personal pages** (My account) are in the account menu, not among the
  admin pages.
- Each page appears once, with one name, and its page title matches the menu
  label. A unit test checks both, in Arabic and English.

## Behaviour

- **Role-based:** each item shows only when the person's role allows that
  page; a section with nothing left is hidden. The server checks every
  request again; hiding a link is for clarity, not security.
- **Sections fold:** clicking a section heading folds it, and the choice is
  remembered. The section holding the current page always stays open.
- **Desktop:** full sidebar, which can be collapsed to an icon rail (the
  choice is remembered). In the rail, labels appear as tooltips, and an item
  with sub-pages opens a menu beside it.
- **Tablet (below 1280 px):** starts with the icon rail.
- **Phone (below 768 px):** the sidebar slides in from the menu button.
- **Right-to-left:** in Arabic the sidebar is on the right, and tooltips and
  menus open towards the page.
- **Accessibility:** one labelled `nav` landmark; the current page is marked
  with `aria-current="page"`; section toggles use `aria-expanded`, and folded
  content is `inert` so it can't be reached by keyboard; there is a skip link
  to the content; all controls are keyboard-operable with visible focus.

## Adding a module

1. Add the route in `apps/admin/src/main.tsx`.
2. Add one item to the right section in `navigation.tsx`, with an icon from
   `lucide-react`, its permission rule, and a few search keywords:
   - website content (products, media, pages) → **Content & design**;
   - visitors and customers (sign-ups, enquiries) → **Audience**;
   - configuration of one website → **Website settings**;
   - anything across all websites → **Administration**.
3. Add its label to `nav` in `messages.ts` (both languages), and use the
   same text as the page title.
4. If an item gets sub-pages, give it `children` (one level only). It then
   expands in place in the sidebar, or opens a menu from the icon rail.
5. If a group grows past about seven items, split it into a new section
   rather than nesting deeper.
