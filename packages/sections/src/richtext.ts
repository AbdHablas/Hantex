import { z } from 'zod';

/**
 * Rich text (D-036): a small, strict subset of the Tiptap/ProseMirror document format. Only
 * paragraphs, two heading levels, lists, line breaks, bold, italic and links exist. It is stored
 * as data, never HTML, and the sites render it with their own code, so nothing written in the
 * editor can inject markup or scripts.
 */

const safeHref = z
  .string()
  .max(500)
  .refine((href) => {
    if (/^\/(?!\/)[\w\-./#]*$/.test(href)) return true; // a path on the same site
    try {
      const url = new URL(href);
      return url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:';
    } catch {
      return false;
    }
  }, 'Links must be https:, mailto:, tel: or a path on this site');

const markSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bold') }),
  z.strictObject({ type: z.literal('italic') }),
  z.strictObject({ type: z.literal('link'), attrs: z.strictObject({ href: safeHref }) }),
]);

const inlineSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'),
    text: z.string().min(1).max(5000),
    marks: z.array(markSchema).max(3).optional(),
  }),
  z.strictObject({ type: z.literal('hardBreak') }),
]);

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).max(200).optional(),
});

const headingSchema = z.strictObject({
  type: z.literal('heading'),
  attrs: z.strictObject({ level: z.union([z.literal(2), z.literal(3)]) }),
  content: z.array(inlineSchema).max(50).optional(),
});

const listItemSchema = z.strictObject({
  type: z.literal('listItem'),
  content: z.array(paragraphSchema).min(1).max(5),
});

const listSchema = (type: 'bulletList' | 'orderedList') =>
  z.strictObject({ type: z.literal(type), content: z.array(listItemSchema).min(1).max(50) });

const blockSchema = z.discriminatedUnion('type', [
  paragraphSchema,
  headingSchema,
  listSchema('bulletList'),
  listSchema('orderedList'),
]);

export const richDocSchema = z
  .strictObject({ type: z.literal('doc'), content: z.array(blockSchema).max(200) })
  .refine((doc) => JSON.stringify(doc).length <= 40_000, 'The text is too long');

export type RichDoc = z.infer<typeof richDocSchema>;
export type RichBlock = RichDoc['content'][number];
export type RichInline = z.infer<typeof inlineSchema>;

export const emptyRichDoc = (): RichDoc => ({ type: 'doc', content: [] });

/** Plain text of a document, e.g. to check whether a language is empty. */
export function richText(doc: RichDoc): string {
  const inline = (nodes: RichInline[] | undefined) =>
    (nodes ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('');
  return doc.content
    .map((block) =>
      block.type === 'paragraph' || block.type === 'heading'
        ? inline(block.content)
        : block.content
            .map((item) => item.content.map((p) => inline(p.content)).join(' '))
            .join(' '),
    )
    .join('\n')
    .trim();
}

/** A document with one paragraph per line, for defaults and templates. */
export function richDocFromText(text: string): RichDoc {
  return {
    type: 'doc',
    content: text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => ({
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: line }],
      })),
  };
}
