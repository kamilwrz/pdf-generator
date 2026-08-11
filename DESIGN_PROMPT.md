Act as a Senior Frontend Engineer and Expert UI Designer.
Your task is to redesign the complete Landing Page / Hero.jsx of this app on the first attempt. Dont change the text content. Focus just on the design and visual aspects.

Generate the final code immediately following these definitions:

## Style

- **Name:** Minimalism & Swiss Style
- **Type:** Clean, Geometric, Functional, Grid-Based
- **Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential
- **Era:** 1950s Swiss
- **Light/Dark:** ✓ Full / ✓ Full

## Color Palette

- **Primary:** Monochromatic, Black #000000, White #FFFFFF
- **Secondary:** Neutral (Beige #F5F1E8, Grey #808080, Taupe #B38B6D), Primary accent

## Visual Effects

Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

## AI Visual Direction

ReDesign a minimalist landing page. Use: white space, geometric layouts, sans-serif fonts, high contrast, grid-based structure, essential elements only. Avoid shadows and gradients. Focus on clarity and functionality.

## CSS Technical

```css
display: grid, gap: 2rem, font-family: sans-serif, color: #000 or #FFF, max-width: 1200px, clean borders, no box-shadow unless necessary
```

## Design System Variables

```css
--spacing: 2rem, --border-radius: 0px, --font-weight: 400-700, --shadow: none, --accent-color: single primary only
```

## Implementation Checklist

- ☐ Grid-based layout 12-16 columns
- ☐ Typography hierarchy clear
- ☐ No unnecessary decorations
- ☐ WCAG AAA contrast verified
- ☐ Mobile responsive grid

## Execution Rules

1. Strictly follow the defined visual style.
2. Use high-quality inline SVG icons (Heroicons or Lucide style) — NEVER use emojis as icons.
3. Add `cursor-pointer` and smooth `hover` states (transition-all) on all interactive elements.
4. Required Page Structure:
   - Navbar (Logo + Links + CTA)
   - Hero Section (Impactful Headline + Subtitle + 2 buttons + 3D/Abstract visual element via CSS)
   - Features (3 cards with icons)
   - Testimonials (3 cards)
   - Pricing (3 tiers, highlight the middle one)
   - Final CTA
   - Full Footer with social links, privacy policy, terms of use, contact and SEO links.
5. All text content must stay as it is and be in Polish.
6. The visual must be CLEARLY distinct — do not create a "default Bootstrap" design. Force the use of the provided design system variables.
7. Use `<style>` tags in the head for custom classes (especially for complex backdrop-filter effects and animations) that Tailwind CDN doesn't cover.
8. Full Responsiveness: Layout must adapt perfectly to Mobile, Tablet and Desktop (vertical stack on mobile).
9. Include basic SEO, Viewport and Open Graph meta tags in `<head>`.
10. Footer must contain: Copyright 2026, Secondary navigation links and Social media icons.
11. Make the creative decisions needed to deliver the complete, functional result now.