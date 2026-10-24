# Labscout — Design

**World: the lab notebook.** Paper, ink, one vermilion mark. It should feel like a field researcher's specimen log that a VC can act on: precise, calm, a little editorial. Light theme, because the use scene is a bright demo room and a projector.

## Tokens (public/assets/labscout.css)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5F2EA` | page |
| `--sheet` | `#FFFDF8` | raised surfaces (cards, composer) |
| `--ink` | `#16140F` | text, primary buttons |
| `--ink-2` | `#4A463D` | secondary text (7.9:1 on paper) |
| `--ink-3` | `#6E695D` | tertiary / meta (4.9:1 on paper) |
| `--rule` | `#DDD7C9` | hairlines |
| `--rule-2` | `#C9C1AF` | stronger hairlines, inputs |
| `--mark` | `#D9411E` | the one accent: brand dot, active tab, rank numerals, focus |
| `--mark-ink` | `#B3330F` | accent text on paper (5.2:1) |
| `--mark-wash` | `#FBE6DD` | accent background tint |
| `--ok` | `#1F6B45` | live / current-student state only |
| `--ok-wash` | `#E3F0E8` | |

Type: **Instrument Serif** (display, headlines, rank numerals) · **Inter Tight** (UI + body) · **JetBrains Mono** (data only: scores, endpoints, IDs, code). Scale 13 / 15 / 17 / 22 / 32 / 56 px. Body measure ≤ 68ch.

Shape: radius 10px surfaces, 999px pills, 1px hairlines. Shadow only on the composer and floating cards: `0 1px 0 rgba(22,20,15,.04), 0 12px 32px -16px rgba(22,20,15,.22)`.

Motion: one authored moment: result cards settle in (opacity + 8px rise + blur 4px → 0, 420ms, cubic-bezier(.16,1,.3,1), 40ms stagger). Everything respects `prefers-reduced-motion`.

Icons: inline SVG, 1.5px stroke, 16/20px, `currentColor`, defined once in `assets/shell.js` (`LS.icon(name)`).

## Rules
- No eyebrows/kickers above headings. No gradient text. No colored side-borders. No emoji icons.
- Mono is for data, never decoration.
- Green means "verified live / current student" and nothing else.
- Every number on screen has a source link or a tooltip that says where it came from.
