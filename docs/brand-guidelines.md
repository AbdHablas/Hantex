# Brand guidelines — Hantex Ultra

Source documents supplied by the owner (2026-10-20), not stored in this
repository because it is public:

- *Hantex Ultra — Brand Guidelines, Version 1, 2026* (9 pages)
- *Hantex Ultra — Trademark Reference Sheet, Version 1, 2026* (2 pages)

Everything below is taken from those documents. Where they disagree, the
disagreement is listed under [Discrepancies](#discrepancies) and the open
choice is tracked in [`DECISIONS.md`](DECISIONS.md).

## Identity

- **Name:** Hantex Ultra
- **Tagline (guidelines):** *Power. Connected.*
- **Mark concept:** a letter H built from the two controls found on almost
  every wall — the left leg is a lit rocker switch, the right leg a socket
  with two holes, pinned to the wall by two screws.

## Logo files

Extracted directly from the vector artwork inside the brand guidelines PDF —
not redrawn. Each file was rendered and compared pixel by pixel with the PDF
(differences limited to anti-aliasing at edges).

| File | Use | Source in the guidelines |
|------|-----|--------------------------|
| `brand/logo/mark-on-dark.svg` | Icon mark on Graphite or other dark grounds | "On Graphite", cover, construction page |
| `brand/logo/mark-on-light.svg` | Icon mark on Ice, white or other light grounds | "On Ice"; trademark "Color version" |
| `brand/logo/mark-mono-light.svg` | Single-colour Ice mark on teal, photos or dark grounds | "Mono Light" |
| `brand/logo/mark-mono-dark.svg` | Single-colour Graphite mark on light grounds | "Mono Dark" |

The **full lockup** (mark + "Hantex" + tracked "ULTRA") is the default logo
per the guidelines. Its SVG will be produced once the typeface question is
settled (D-013), with the lettering converted to outlines so it never depends
on installed fonts.

## Mark construction (from the original artwork)

Drawing grid: `viewBox="0 0 120 120"`.

| Element | Geometry | On dark | On light |
|---------|----------|---------|----------|
| Frame | rect 8, 8, 104 × 104, radius 23, stroke 3, no fill | Ice | Graphite |
| Screws | circles at (60, 17) and (60, 103), radius 2.2, 50 % opacity | Ice | Graphite |
| Switch (left leg) | rect 27, 25, 24 × 70, radius 5.4 | Circuit Teal | Circuit Teal |
| Indicator | circle at (39, 36), radius 2.6 | Volt | Volt |
| Base line | line (30, 85) → (48, 85), width 1.5, round caps, 85 % opacity | Ice | Graphite |
| Connecting bar | rect 51, 57, 18 × 6, radius 1.3 | Ice | Graphite |
| Socket (right leg) | rect 69, 25, 24 × 70, radius 5.4, holes at (81, 46) and (81, 74), radius 4, cut out | Ice | Graphite |

Mono versions use one colour for every element.

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
| Volt | `#6EE7F0` | 110, 231, 240 | Indicator glow only — never a background or text colour |

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

Proposed derived text tints (for the design system, to be confirmed):
`#8A909B` muted text on Graphite (5.2 : 1), `#646A75` muted text on Ice
(5.0 : 1), `#137784` teal text or links on light grounds (4.85 : 1). The
logo itself is exempt from contrast requirements.

## Typography

- **Brand guidelines:** Poppins for display and body (Light, Regular,
  Medium, Bold).
- **Trademark sheet:** wordmark in Sora (Bold / Regular), body and interface
  text in Inter, Poppins as substitute.
- **What the artwork actually uses:** every page of both PDFs, including the
  trademark sheet's own "Hantex ULTRA" sample, embeds only Poppins.

Decision pending (D-013). Arabic typography is not covered by either
document.

## Discrepancies

1. **Trademark sheet, colour description** — says the left stroke is a
   neutral tone and only the small circle is cyan. The specimens and all
   artwork show the left stroke in Circuit Teal and the circle in Volt.
   Worth correcting before any filing.
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
6. **Previous Coming Soon page** (see
   [`previous-coming-soon-review.md`](previous-coming-soon-review.md)) uses
   an off-spec mark (shifted switch, shorter bar, no base line) and
   off-palette colours (`#2BD0DF`, `#EEF0F3`, `#111317`). It is not used as
   a brand source.

## Product facts

The guidelines show sample copy such as "10A · 250V", "2 gang combo",
"Shuttered sockets", "Soft-touch rocker" and "Premium electrical switches".
These are typographic examples, not confirmed specifications, and are not
used on the website until the owner confirms them.
