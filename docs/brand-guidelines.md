# Brand guidelines — Hantex Ultra

Source documents supplied by the owner (2026-10-20), not stored in this
repository because it is public:

- *Hantex Ultra — Brand Guidelines, Version 1, 2026* (9 pages)
- *Hantex Ultra — Trademark Reference Sheet, Version 1, 2026* (2 pages)
- *hantex-ultra-edited2* — updated mark on the cover artwork (Adobe
  Illustrator, 12 October 2026), supplied 2026-10-21. **This is the current
  mark** (D-020); it supersedes the mark in the two documents above.

Everything below is taken from those documents. Where they disagree, the
disagreement is listed under [Discrepancies](#discrepancies) and the open
choice is tracked in [`DECISIONS.md`](DECISIONS.md).

## Identity

- **Name:** Hantex Ultra
- **Tagline (guidelines):** *Power. Connected.*
- **Mark concept:** a letter H built from the two controls found on almost
  every wall — the left leg is a lit rocker switch, the right leg a socket
  with two outlets, pinned to the wall by two screws. Nine shapes in all.

## Logo files

Taken directly from the owner's vector artwork — not redrawn. The mark
geometry comes from the updated Illustrator file's vector paths (D-020); the
lettering uses the Poppins glyphs embedded in the brand guidelines PDF,
converted to outlines, at their exact positions. An exact rebuild of the
updated mark was compared pixel by pixel with the owner's PDF (differences
limited to anti-aliasing) before the agreed clean-up was applied.

See [`brand/README.md`](../brand/README.md) for the full list: lockup
(default), icon mark and wordmark, each on dark, on light, mono light and
mono dark.

- **Lockup:** mark, then "Hantex" in Poppins Bold above "ULTRA" in Poppins
  Medium, tracked, in Circuit Teal (Ice on dark, Graphite on light).
- **Wordmark:** "Hantex" centred above "ULTRA".

## Mark construction (current mark, D-020)

Drawing grid: `viewBox="0 0 120 120"` — the Illustrator artboard is exactly
this grid (1 unit = 0.875 pt).

| Element | Geometry | On dark | On light |
|---------|----------|---------|----------|
| Frame | rect 8, 8, 104 × 104, radius 23, stroke 3, no fill | Ice | Graphite |
| Screws | circles at (60, 17) and (60, 103), radius 2.2, 50 % opacity | Ice | Graphite |
| Switch (left leg) | rect 27, 25, 24 × 70, radius 5.4 | Circuit Teal | Circuit Teal |
| Indicator dots | three circles on the switch centre line x = 39, at y 31.58 / 34.30 / 37.76, radii 0.89 / 1.20 / 1.62 (growing downwards) | Ice | Ice |
| Connecting bar | rect 51, 57, 18 × 6, radius 1.3 | Ice | Graphite |
| Socket (right leg) | rect 69, 25, 24 × 70, radius 5.4, with two outlet cut-outs centred on x = 81: upper — round hole (radius 3.65, centre y 46.22) on a flat bar 9.7 × 3.3; lower — the same shape mirrored (bar on top, hole centre y 73.78) | Ice | Graphite |

- Mono versions use one colour for every element; the indicator dots are then
  the same colour as the switch and are omitted.
- **Agreed clean-up of the supplied file (D-020):** the socket is set in Ice
  (the file had pure white `#FFFFFF`), and the switch and its dots sit on the
  27-unit grid line (the file had them 0.1 pt to the right, overlapping the
  connecting bar slightly).
- **Changes from the previous mark:** the Volt indicator dot and the bright
  base line on the switch are replaced by the three indicator dots; the
  socket's two round holes are replaced by the two outlet shapes.

### Usage rules (guidelines, page 5)

- Never recolour, distort or rotate the mark.
- The full lockup is the default; the icon or wordmark alone only once the
  mark is established in context.

## Colour

| Name | Hex | RGB | Role (guidelines) |
|------|-----|-----|-------------------|
| Graphite | `#1B1E24` | 27, 30, 36 | Primary ground, plate housing |
| Circuit Teal | `#1FB6C9` | 31, 182, 201 | Switch accent, live state |
| Ice | `#F4F6F8` | 244, 246, 248 | Light ground, reversed mark |
| Steel | `#7B818C` | 123, 129, 140 | Body copy, muted labels |
| Volt | `#6EE7F0` | 110, 231, 240 | Indicator glow only — never a background or text colour. No longer used in the current mark; kept for live-state glows in the interface |

Gradients observed in the guidelines' applications (sampled from rendered
pages, approximate): teal panel `#3BCCDC → #138592` (top-left to
bottom-right); graphite depth `#1B1E24 → #0F1114`.

### Accessibility (WCAG 2.1 AA contrast, calculated)

| Text | Ground | Ratio | Result |
|------|--------|-------|--------|
| Ice | Graphite | 15.41 : 1 | Pass |
| Circuit Teal | Graphite | 6.83 : 1 | Pass |
| Graphite | Circuit Teal | 6.83 : 1 | Pass — use dark text on teal buttons |
| Steel | Graphite | 4.26 : 1 | Large text only |
| Steel | Ice | 3.62 : 1 | Large text only |
| Circuit Teal | Ice | 2.26 : 1 | Fail — no teal text on light grounds |
| Ice / white | Circuit Teal | 2.26–2.44 : 1 | Fail — no light text on teal |

Derived text shades used by the default theme (`packages/theme`), chosen so
every text pair passes AA on every surface in its mode: muted text
`#9AA0AB` in dark mode (5.1–6.4 : 1) and `#5F6570` in light mode
(5.4–5.9 : 1); teal text and links on light grounds `#137784` (4.85 : 1). The
logo itself is exempt from contrast requirements.

## Typography

- **Brand guidelines:** Poppins for display and body (Light, Regular,
  Medium, Bold).
- **Trademark sheet:** wordmark in Sora (Bold / Regular), body and interface
  text in Inter, Poppins as substitute.
- **What the artwork actually uses:** every page of both PDFs, including the
  trademark sheet's own "Hantex ULTRA" sample, embeds only Poppins.

**Confirmed (D-013): Poppins** for the wordmark, headings and body, self-hosted.

**Arabic (D-015): Readex Pro**, paired with Poppins — Arabic text in Readex
Pro, Latin text (including "Hantex Ultra" inside Arabic sentences) in
Poppins. Neither brand document covers Arabic; this pairing was chosen by the
owner from rendered samples. Both fonts are SIL Open Font Licence 1.1.

## Discrepancies

1. **Trademark sheet is out of date** — it describes and shows the previous
   mark (two round socket holes, Volt indicator circle, base line). Its
   specimens, written description and construction table need updating to
   the current mark before any filing. Its colour description also
   contradicted its own specimens (left stroke described as neutral, shown in
   Circuit Teal).
2. **Connecting bar** — the sheet says it touches neither stroke; in the
   artwork it exactly fills the 18-unit gap (touches both, overlaps
   neither, as the guidelines say).
3. **Screws** — the sheet says above and below the frame; in the artwork
   they sit inside the frame, above and below the H.
4. **Typeface** — Poppins (guidelines and artwork) versus Sora + Inter
   (trademark sheet text). See D-013.
5. **Wordmark case** — the cover sets "HANTEX"; the logo system and
   trademark sheet set "Hantex" with "ULTRA" below. The logo system page
   (the default lockup) is followed.
6. **Brand guidelines pages 2–8** still show the previous mark; only the
   cover was supplied in updated form. The current mark (this document and
   `brand/logo/`) takes precedence.
7. **Previous Coming Soon page** (see
   [`previous-coming-soon-review.md`](previous-coming-soon-review.md)) uses
   an off-spec mark (shifted switch, shorter bar, no base line) and
   off-palette colours (`#2BD0DF`, `#EEF0F3`, `#111317`). It is not used as
   a brand source.

## Product facts

The guidelines show sample copy such as "10A · 250V", "2 gang combo",
"Shuttered sockets", "Soft-touch rocker" and "Premium electrical switches".
These are typographic examples, not confirmed specifications, and are not
used on the website until the owner confirms them.
