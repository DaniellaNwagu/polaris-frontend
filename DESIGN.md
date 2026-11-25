# Polaris frontend design reference

This document names the purpose of the shared CSS tokens and component variants.
It is a usage guide, not a restatement of Tailwind utilities or a request to
introduce a separate visual theme.

## CSS design tokens

All tokens are declared in `src/app/globals.css` and switch between light and
dark values in `@media (prefers-color-scheme: dark)`. Consume them through
`var(...)`; do not add a second palette or hard-code a one-off semantic color
when an existing token expresses the same meaning.

| Token | Purpose | Typical use |
|---|---|---|
| `--bg` | Page and canvas background | App shells and the negative space behind cards |
| `--surface` | Primary elevated or contained surface | Cards, inputs, and selected controls |
| `--surface-2` | Secondary, lower-emphasis surface | Hover states, neutral fills, and compact groups |
| `--ink` | Highest-emphasis text and icon color | Headings, primary labels, and strong values |
| `--ink-soft` | Secondary text | Supporting copy and less prominent labels |
| `--muted` | Standard subdued text | Captions, metadata, and inactive explanatory text |
| `--faint` | Lowest-emphasis text that remains visible | Eyebrows, timestamps, and decorative metadata |
| `--line` | Structural border and divider | Card edges, rows, form controls, and separators |
| `--accent` | Brand and interaction color | Primary actions, focus rings, links, and active accents |
| `--accent-ink` | Higher-contrast accent text | Accent-colored links and text in both themes |
| `--accent-soft` | Soft accent fill | Accent badges and lightly selected informational areas |
| `--yes` | Positive, affirmative semantic color | YES market side, wins, healthy status, and positive values |
| `--yes-soft` | Soft positive fill | YES-side and win-state backgrounds or badges |
| `--no` | Negative, destructive semantic color | NO market side, losses, errors, and destructive actions |
| `--no-soft` | Soft negative fill | NO-side, loss, and error-state backgrounds or badges |
| `--warn` | Warning semantic color | Caution text and non-destructive warnings |
| `--warn-soft` | Soft warning fill | Warning badges and warning backgrounds |

Use semantic `yes`, `no`, and `warn` tokens only for states that carry that
meaning. A non-financial color choice should usually use `accent`, `surface`,
or a text token rather than borrowing a semantic token.

## Button variants

`buttonVariants` in `src/components/ui/button-variants.ts` is the shared API
for real `<Button>` elements and links that need button styling. Prefer the
`variant` and `size` props over assembling the same classes at call sites.

| Variant | Intended use |
|---|---|
| `primary` | One clear main action in a section or page |
| `default` | Compatibility alias for `primary`; prefer `primary` in new code |
| `secondary` | A solid, non-brand alternative to `primary` |
| `outline` | A neutral secondary or utility action |
| `ghost` | A low-emphasis action, especially one embedded in a dense control area |
| `yes` | An action explicitly tied to the YES market side |
| `no` | An action explicitly tied to the NO market side or a negative consequence |
| `destructive` | Destructive or irreversible actions. Currently uses the negative/no palette because the app has no separate destructive token |

`primary` is the default variant and `md` is the default size.

| Size | Intended use |
|---|---|
| `sm` | Compact toolbar, table, or inline actions |
| `md` | Default form and card actions |
| `lg` | Landing-page and other prominent calls to action |
| `touch` | Mobile/embedded controls that require a minimum 44px touch target |

Use at most one `primary` action in a local decision. In a YES/NO choice, use
`yes` and `no` for the selected or proposed side; use `outline` for the
unselected alternative. Do not use `primary` merely for visual prominence
inside a binary market decision.

## Card and content primitives

`Card` and `CardBody` in `src/components/ui/card.tsx` provide the shared
surface and default padding. There is intentionally no Card CVA variant API:
use `className` for layout, spacing, density, and interaction adjustments.

- `Card` — the base bordered, elevated surface. Use it for a meaningful group
  of related content, not as a generic wrapper around a page section.
- `CardBody` — the padded Card interior. The default padding is `p-5`; pass
  `className` to adjust density or add layout utilities.
- Combine `Card` and `CardBody` for the standard pattern. Add
  `transition-shadow`, `hover:shadow-md`, or tighter padding only when the
  card is interactive or constrained, rather than making a new card variant.

## Badge tones

`Badge` in `src/components/ui/badge.tsx` uses a separate, semantic `tone`
prop:

| Tone | Intended use |
|---|---|
| `neutral` | Default status or metadata with no strong meaning |
| `accent` | Brand/active status or a live/open informational state |
| `yes` | Won, healthy, or affirmative status |
| `no` | Lost, down, failed, or negative status |
| `warn` | Caution or a state that needs attention |
