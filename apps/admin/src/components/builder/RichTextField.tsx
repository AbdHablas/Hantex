import { richDocSchema, safeHref, type RichDoc } from '@hantex/sections';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useI18n } from '../../lib/i18n';
import { Button, Input, cn } from '../ui';

/**
 * Rich text (D-036) with Tiptap, limited to what the sites can draw: paragraphs, two heading
 * levels, lists, line breaks, bold, italic and safe links. What the editor produces is cut down
 * to that subset (toRichDoc) and checked against the same schema the API uses.
 */

type Inline = NonNullable<Extract<RichDoc['content'][number], { type: 'paragraph' }>['content']>;

function inline(nodes: JSONContent[] | undefined): Inline | undefined {
  const out: Inline = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') out.push({ type: 'hardBreak' });
    if (node.type !== 'text' || !node.text) continue;
    const marks: NonNullable<Extract<Inline[number], { type: 'text' }>['marks']> = [];
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold' || mark.type === 'italic') marks.push({ type: mark.type });
      const href: unknown = mark.attrs?.['href'];
      if (mark.type === 'link' && typeof href === 'string' && safeHref.safeParse(href).success) {
        marks.push({ type: 'link', attrs: { href } });
      }
    }
    out.push(
      marks.length > 0
        ? { type: 'text', text: node.text, marks }
        : { type: 'text', text: node.text },
    );
  }
  return out.length > 0 ? out : undefined;
}

const paragraph = (node: JSONContent) => {
  const content = inline(node.content);
  return content ? { type: 'paragraph' as const, content } : { type: 'paragraph' as const };
};

/** The editor's document, reduced to the stored rich-text format. */
export function toRichDoc(json: JSONContent): RichDoc {
  const content: RichDoc['content'] = [];
  for (const block of json.content ?? []) {
    if (block.type === 'paragraph') content.push(paragraph(block));
    if (block.type === 'heading') {
      const level = block.attrs?.['level'] === 3 ? 3 : 2;
      const text = inline(block.content);
      content.push({ type: 'heading', attrs: { level }, ...(text ? { content: text } : {}) });
    }
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      const items = (block.content ?? [])
        .filter((item) => item.type === 'listItem')
        .map((item) => ({
          type: 'listItem' as const,
          content: (item.content ?? [])
            .filter((c) => c.type === 'paragraph')
            .slice(0, 5)
            .map(paragraph),
        }))
        .filter((item) => item.content.length > 0);
      if (items.length > 0) content.push({ type: block.type, content: items });
    }
  }
  // An editor with only an empty paragraph is an empty text.
  const empty = content.every((b) => b.type === 'paragraph' && !b.content);
  return { type: 'doc', content: empty ? [] : content };
}

function ToolButton({
  label,
  active,
  onClick,
  children,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50 [&_svg]:size-4',
        active && 'bg-accent-soft text-accent-text',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  language,
  disabled,
}: {
  editor: Editor;
  language: string;
  disabled: boolean;
}) {
  const { m, format } = useI18n();
  const b = m.builder;
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      href: (e.getAttributes('link')['href'] as string | undefined) ?? '',
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const linkId = useId();
  const valid = href === '' || safeHref.safeParse(href).success;
  const chain = () => editor.chain().focus();
  return (
    <div className="border-b border-border">
      <div
        role="toolbar"
        aria-label={format(b['textToolbar'] ?? '', { language })}
        className="flex flex-wrap gap-0.5 p-1"
      >
        <ToolButton
          label={b['bold'] ?? ''}
          active={state.bold}
          disabled={disabled}
          onClick={() => chain().toggleBold().run()}
        >
          <Bold aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['italic'] ?? ''}
          active={state.italic}
          disabled={disabled}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['heading2'] ?? ''}
          active={state.h2}
          disabled={disabled}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['heading3'] ?? ''}
          active={state.h3}
          disabled={disabled}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['bulletList'] ?? ''}
          active={state.bullet}
          disabled={disabled}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['orderedList'] ?? ''}
          active={state.ordered}
          disabled={disabled}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden />
        </ToolButton>
        <ToolButton
          label={b['addLink'] ?? ''}
          active={state.link || linkOpen}
          disabled={disabled}
          onClick={() => {
            setHref(state.href);
            setLinkOpen((open) => !open);
          }}
        >
          <Link2 aria-hidden />
        </ToolButton>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
          <label htmlFor={linkId} className="sr-only">
            {b['linkPrompt']}
          </label>
          <Input
            id={linkId}
            dir="ltr"
            className="h-8 min-w-0 flex-1"
            placeholder="https://"
            value={href}
            aria-invalid={!valid}
            onChange={(e) => setHref(e.target.value.trim())}
          />
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              if (href === '') chain().extendMarkRange('link').unsetLink().run();
              else chain().extendMarkRange('link').setLink({ href }).run();
              setLinkOpen(false);
            }}
          >
            {m.save}
          </Button>
          {!valid && <p className="basis-full text-xs text-danger">{b['linkInvalid']}</p>}
        </div>
      )}
    </div>
  );
}

/** One language's rich text. */
export function RichTextEditor({
  value,
  onChange,
  lang,
  label,
  disabled,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  lang: 'ar' | 'en';
  label: string;
  disabled: boolean;
}) {
  const editor = useEditor({
    // The dashboard's CSP allows no <style> elements; the editor's styles are in styles.css.
    injectCSS: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: false,
          isAllowedUri: (url) => safeHref.safeParse(url).success,
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        lang,
        dir: lang === 'ar' ? 'rtl' : 'ltr',
        class: 'rich-editor min-h-28 px-3 py-2 text-sm focus-visible:outline-none',
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = toRichDoc(e.getJSON());
      if (richDocSchema.safeParse(doc).success) onChange(doc);
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  if (!editor) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-input bg-surface shadow-sm focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <Toolbar editor={editor} language={label} disabled={disabled} />
      <EditorContent editor={editor} />
    </div>
  );
}

/** Rich text in both languages, as a section field. */
export function RichTextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: { ar: RichDoc; en: RichDoc };
  onChange: (value: { ar: RichDoc; en: RichDoc }) => void;
  disabled: boolean;
}) {
  const { m } = useI18n();
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {(['ar', 'en'] as const).map((lang) => {
        const name = lang === 'ar' ? m.comingSoon.ar : m.comingSoon.en;
        return (
          <div key={lang} className="grid gap-1.5">
            <span className="text-sm text-muted">{name}</span>
            <RichTextEditor
              lang={lang}
              label={`${label} (${name})`}
              value={value[lang]}
              disabled={disabled}
              onChange={(doc) => onChange({ ...value, [lang]: doc })}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
