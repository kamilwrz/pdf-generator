---
version: "1.0"
name: "CV Studio Swiss Design System"
description: "Application-wide Swiss design system for every CV Studio route, workflow, component, and UI state."
scope:
  - landing
  - authentication
  - editor-shell
  - editor-tools
  - galleries
  - ai-workflows
  - dialogs
  - notifications
  - loading-empty-error-states
  - responsive-layouts
colors:
  ink: "#161616"
  paper: "#FFFFFF"
  canvas: "#F5F1E8"
  surface: "#ECE8DF"
  muted: "#686868"
  border: "#C9C5BC"
  accent: "#8A664F"
  focus: "#155EEF"
  success: "#18794E"
  warning: "#9A6700"
  danger: "#B42318"
typography:
  ui: "Helvetica Neue, Helvetica, Arial, sans-serif"
  mono: "JetBrains Mono, Consolas, monospace"
  display:
    fontSize: "clamp(2.5rem, 6vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 0.94
  h1:
    fontSize: "clamp(2rem, 4vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1
  h2:
    fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.06em"
radii:
  control: "2px"
  panel: "0px"
  pill: "999px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
  "3xl": "64px"
layout:
  columns: 12
  maxWidth: "1440px"
  contentMeasure: "72ch"
  breakpointCompact: "768px"
  breakpointWide: "1200px"
motion:
  fast: "120ms"
  standard: "200ms"
  slow: "320ms"
  easing: "cubic-bezier(0.2, 0, 0, 1)"
elevation:
  popover: "0 12px 32px rgba(22, 22, 22, 0.16)"
  editorSection: "0 8px 20px rgba(22, 22, 22, 0.14)"
  editorEntry: "0 5px 14px rgba(22, 22, 22, 0.13)"
  editorElement: "0 2px 7px rgba(22, 22, 22, 0.18)"
---

# CV Studio Swiss Design System

## 1. Purpose and scope

This document is the visual and interaction contract for the entire CV Studio application. It is not a landing-page theme. Every route, reusable component, temporary surface, and user-visible state must use the same Swiss design language.

The contract applies to:

- the public landing page;
- login and registration;
- the editor shell, top bar, sidebars, panels, page controls, and canvas tools;
- template selection, file galleries, upload areas, and document management;
- AI assistant and AI-powered CV workflows;
- dialogs, drawers, popovers, menus, tooltips, banners, toasts, and overlays;
- loading, skeleton, empty, success, warning, validation, error, offline, and permission states;
- desktop, tablet, and mobile layouts;
- all new UI introduced after this document is adopted.

The generated CV templates may keep their own template-specific typography and visual identity because they are user-authored document output. The application chrome around those templates, including selection affordances, handles, guides, toolbars, controls, and dialogs, must follow this design system. A template must never leak its styles into the application UI.

## 2. Design principles

Swiss design is treated as infrastructure rather than decoration.

1. **Grid before ornament.** Align elements to an explicit grid and shared baselines. Do not compensate for weak structure with decoration.
2. **Hierarchy through type and space.** Use scale, weight, alignment, and whitespace before shadows, gradients, or illustrations.
3. **Function is visible.** Controls must look actionable, state changes must be unambiguous, and labels must be specific.
4. **Asymmetry is deliberate.** Prefer balanced asymmetric compositions over repetitive equal-width card grids.
5. **Consistency across workflows.** The landing page, authentication, editor, and dialogs must feel like one product.
6. **Density follows the task.** Marketing surfaces may be spacious; editor surfaces may be compact. Both must use the same tokens and hierarchy.
7. **Accessibility is part of the system.** Contrast, keyboard access, focus, semantics, target sizes, reduced motion, and zoom support are release requirements.

Target character:

- clean, rational, editorial, geometric, direct, and professional;
- high contrast with restrained warm neutrals;
- sharp or nearly sharp geometry;
- low visual noise and no decorative effects without an information purpose.

## 3. Design tokens

Tokens are the only source of shared visual values. Reusable colors, spacing, typography, radii, borders, elevation, z-index, and motion values must be defined centrally as CSS custom properties or equivalent theme tokens. Components must not introduce arbitrary near-duplicate values.

### 3.1 Color

| Token | Value | Purpose |
| --- | --- | --- |
| `ink` | `#161616` | Primary text, dark actions, dark application surfaces |
| `paper` | `#FFFFFF` | Primary light surface, inputs, dialogs |
| `canvas` | `#F5F1E8` | Application background and warm neutral field |
| `surface` | `#ECE8DF` | Secondary panels, selected or grouped regions |
| `muted` | `#686868` | Secondary text that still meets contrast requirements |
| `border` | `#C9C5BC` | Dividers, input borders, structural rules |
| `accent` | `#8A664F` | Restrained brand emphasis and selected accents |
| `focus` | `#155EEF` | Keyboard focus ring and interaction visibility |
| `success` | `#18794E` | Confirmed success only |
| `warning` | `#9A6700` | Recoverable risk or attention only |
| `danger` | `#B42318` | Destructive actions and errors only |

Rules:

- Use `ink`, not pure `#000000`, for large dark surfaces and primary text.
- Body text must meet WCAG AA contrast at minimum. Target AAA for ordinary body copy where the palette permits it.
- Never communicate status by color alone; pair it with text and, where useful, an icon or shape.
- Semantic colors keep their meaning everywhere. Do not use danger red as decoration or focus blue as a brand accent.
- Gradients, glassmorphism, neon glow, and oversaturated accents are not part of this system.
- Dark mode, if present, must use semantic token aliases and preserve hierarchy and contrast. Do not invert colors mechanically.

### 3.2 Typography

Use a neutral sans-serif UI stack: `Helvetica Neue`, `Helvetica`, `Arial`, `sans-serif`. Use `JetBrains Mono` only for technical identifiers, measurements, page numbers, keyboard shortcuts, and machine-like metadata.

- Display: `clamp(2.5rem, 6vw, 5.5rem)`, weight 700, line-height 0.94, tight tracking.
- H1: `clamp(2rem, 4vw, 3.5rem)`, weight 700, line-height 1.
- H2: `clamp(1.5rem, 2.5vw, 2.25rem)`, weight 700, line-height 1.1.
- H3: `1.125rem`, weight 700, line-height 1.25.
- Body: `1rem`, weight 400, line-height 1.55, maximum readable measure 72 characters.
- Compact UI body: `0.875rem`, line-height 1.4. Do not use this size for long-form copy.
- Labels and metadata: `0.75rem`, weight 600, line-height 1.25, letter-spacing 0.06em. Uppercase is reserved for short labels, not sentences.

Rules:

- Establish hierarchy with no more than three visible type sizes in one compact surface.
- Left-align working UI and long-form text. Center alignment is allowed only for short, intentionally isolated states.
- Do not use decorative display fonts in application chrome.
- Do not reduce essential text below 12px. User input and mobile form text must remain at least 16px where required to prevent browser zoom.

### 3.3 Spacing and sizing

Use a 4px base unit and the scale `4, 8, 12, 16, 24, 32, 48, 64, 96`. Prefer these values for gaps, padding, offsets, and dimensions.

- Minimum pointer target: 44×44px when space allows; never below 36×36px for dense editor controls.
- Standard control height: 44px. Compact editor control height: 36px.
- Page gutters: 16px compact, 24px tablet, 32–48px wide screens.
- Section gaps: 48–96px on narrative pages; 16–32px inside working surfaces.
- Borders: normally 1px. Use 2px for strong selected states or focus visibility, not decoration.

### 3.4 Shape, elevation, and layering

- Default panels and cards are square: `0px` radius.
- Interactive controls may use up to `2px` radius.
- Pills are reserved for tags, status badges, and compact filters whose shape communicates containment.
- Prefer borders, contrasting surfaces, and spacing over shadows in ordinary application chrome.
- If separation cannot be expressed otherwise, use one restrained shadow per rendered layer; do not stack multiple shadows on the same layer.
- Canvas context is the narrow exception: section, entry, and exact-element editor overlays use the neutral `editorSection`, `editorEntry`, and `editorElement` elevation tokens instead of borders or tinted fills. Their decreasing reach communicates containment and slight physical depth without borrowing colors from a CV template. The A4 surface inverse-scales these tokens so their screen-space size remains stable at every canvas zoom. Keyboard focus remains a separate blue `focus` outline.
- Never use floating cards as the default page structure.

Z-index contract:

- base content: 0;
- sticky application chrome: 100;
- popovers and menus: 200;
- modal backdrop and dialog: 300;
- drag or selection affordances: 400 when required by the editor;
- toasts: 500.

## 4. Layout system

Use CSS Grid for page structure and Flexbox for one-dimensional alignment. Wide layouts use a 12-column grid within a maximum width of 1440px. Align page titles, navigation, panels, form fields, and content edges to the same column logic.

### Narrative surfaces

Landing, onboarding, and explanatory pages may use generous whitespace and asymmetric editorial compositions. Prefer split layouts, staggered content, and strong typographic anchors. Avoid generic three-card feature rows.

A full-screen onboarding decision surface replaces the complete editor shell until the user chooses a path. Editor navigation, tool rails, canvas controls, and persistent AI actions must not remain visible or keyboard-reachable behind it. Dialogs launched from onboarding may appear above the surface and must restore focus to their onboarding trigger when closed.

### Working surfaces

The editor and other task-heavy screens may be denser, but must remain grid-based:

- top bar aligns global navigation, document identity, status, and primary actions;
- sidebars use consistent widths and internal padding;
- the canvas receives the largest flexible region and remains visually separate from controls;
- related controls are grouped by borders, spacing, and headings rather than decorative containers;
- persistent actions remain predictable and must not cover document content.

### Responsive behavior

- Use content-driven breakpoints; 768px and 1200px are reference points, not excuses for device-specific layouts.
- Multi-column narrative layouts collapse into a logical reading order below 768px.
- On compact editor layouts, secondary panels become drawers or sheets, while the document canvas and the current primary task remain visible.
- Toolbars may wrap or expose an explicit overflow menu. They must never create horizontal page scrolling.
- Modals must fit within `100dvh`, keep their header and actions reachable, and make only their content region scroll when necessary.
- Do not use `100vh`/`h-screen` for full-height application shells; use dynamic viewport units such as `100dvh` with a safe fallback.
- Support browser zoom to 200% without losing controls, content, or task completion.

## 5. Application-wide component contract

### 5.1 Navigation and application chrome

- Navigation uses a clear baseline, restrained borders, and a visible current location.
- The active item requires more than a subtle color change: use weight, an indicator rule, or a contrasting surface.
- Logo, route navigation, document title, save state, and primary action must have a stable hierarchy.
- Sticky UI must not obscure focused elements or editor content.

### 5.2 Buttons and icon controls

- Primary buttons use `ink` fill with `paper` text.
- Secondary buttons use a transparent or `paper` background, `ink` text, and a 1px structural border.
- Tertiary actions appear as text or icon controls without losing hover and focus affordances.
- Destructive actions use the danger token and require precise labels. Confirmation is required when recovery is difficult.
- Every control needs default, hover, active, focus-visible, disabled, and loading states.
- Icon-only buttons require an accessible name and a tooltip when the icon may be unfamiliar.
- Use one icon family consistently. Do not use emoji as interface icons.

### 5.3 Forms

- Labels appear above inputs and remain visible while typing. Floating labels are not allowed.
- Required and optional status must be explicit.
- Help text and validation messages appear adjacent to the related field.
- Error messages explain how to recover; do not display only “Invalid value”.
- Focus uses a 2px `focus` ring with sufficient offset.
- Disabled and read-only fields must be visually and semantically distinct.
- Preserve entered values after recoverable validation or server errors.

### 5.4 Panels, cards, lists, and galleries

- Use panels for structural regions and cards only for truly independent, selectable objects.
- Lists and galleries share consistent alignment, metadata placement, selected state, and action placement.
- Selected template or document cards use a 2px outline plus a textual or icon indicator.
- Dense datasets use rows or tables instead of turning every item into a large card.
- Avoid equal-width card walls when hierarchy or comparison would be clearer with an asymmetric grid or list.

### 5.5 Dialogs, drawers, menus, and popovers

- Reuse a shared dialog shell and shared panel primitives.
- Dialogs require a visible title, an accessible description when useful, predictable close behavior, focus trapping, Escape handling, and focus restoration.
- Primary and secondary actions stay in a consistent footer location.
- Destructive confirmation dialogs name the object and consequence.
- Popovers and menus close predictably, remain keyboard navigable, and stay within the viewport.
- Do not nest modals. Convert the secondary step into the current dialog state or a dedicated route.

### 5.6 Feedback and asynchronous states

- Use skeletons that match final geometry for initial content loading.
- Use an inline progress indicator for a known-duration task and a restrained spinner only for small, indeterminate actions. Never replace an entire working screen with an unexplained spinner.
- Empty states explain what is absent and offer the next relevant action.
- Error states explain impact, preserve recoverable work, and provide retry or escape paths.
- Toasts confirm background or non-blocking outcomes; they do not contain critical information required to continue.
- Saving and export workflows must expose `idle`, `working`, `success`, and `failure` states without layout shift.

### 5.7 Editor and PDF canvas

- The document remains the dominant object; chrome must support it rather than compete with it.
- Selection affordances, resize handles, alignment guides, insertion controls, and AI correction highlights must use a coherent interaction language and remain distinguishable from document content.
- Structural section, entry, and element context is shown with the shared neutral editor elevation hierarchy, without colored overlay surfaces or decorative borders. These shadows belong only to application chrome and must not enter layout, persistence, or PDF output.
- Canvas zoom, page boundaries, page numbers, and active selection must be readable at every supported scale.
- Hover-only tools must also be reachable by keyboard or through a persistent control path.
- Dragging must provide visible origin, current target, and invalid-drop feedback.
- UI styling must not change printed dimensions or leak into PDF export.

### 5.8 AI workflows

- AI functionality uses the same components and hierarchy as the rest of the product; it must not introduce gradients, glowing borders, or a separate “magic” visual language.
- Clearly distinguish user input, generated suggestions, pending work, applied changes, and errors.
- Applying generated content must show the scope of the change and provide undo when feasible.
- Loading copy must describe the current operation without pretending to know an exact completion time.

## 6. Motion

Motion explains causality and state; it is never ambient decoration.

- Hover and press feedback: 120–200ms.
- Panels, dialogs, and route transitions: 200–320ms.
- Animate only `transform` and `opacity` where practical.
- Avoid parallax, looping decoration, bouncy spring motion, and long staggered entrances in working UI.
- Respect `prefers-reduced-motion: reduce` by removing non-essential movement and making state changes immediate or nearly immediate.
- Never delay input, navigation, saving, or modal dismissal to finish an animation.

## 7. Content and iconography

- Write direct, specific labels: “Export PDF”, “Change template”, and “Save document”.
- Avoid marketing clichés such as “Elevate”, “Seamless”, “Unleash”, and “Next-Gen”.
- Avoid generic lorem ipsum in product states and demos.
- Use sentence case for buttons and headings unless a short metadata label intentionally uses uppercase.
- Use one consistent icon library. Icons complement text; they do not replace ambiguous action labels.
- External images require stable local assets or an explicit loading and fallback strategy. Broken-image states are not acceptable.

## 8. Accessibility requirements

- Use semantic HTML before ARIA.
- Every workflow must be completable with a keyboard.
- Focus order follows visual and task order.
- `:focus-visible` is always clearly visible and never removed without an equivalent replacement.
- Dialogs, menus, tabs, disclosures, and live notifications follow their established accessibility patterns.
- Form errors are programmatically associated with fields and announced when appropriate.
- Touch targets, color contrast, text zoom, reduced motion, and screen-reader names are part of acceptance testing.
- Preserve user work and explain recovery after errors or session interruptions.

## 9. Implementation rules

1. Before changing UI, inventory the affected route, its components, and every state: default, hover, active, focus, disabled, loading, empty, error, success, and responsive.
2. Reuse or extend central tokens and shared primitives before adding component-local values.
3. Do not solve a local mismatch with one-off colors, spacing, radii, shadows, or typography.
4. Keep CSS Modules for component scope where the codebase uses them, but source shared visual values from global tokens.
5. Preserve product behavior and the visual identity of user-selectable CV templates unless the task explicitly changes them.
6. When a legacy component conflicts with this document, migrate it toward the system in the same change when it is in scope.
7. Remove obsolete styles and variants made redundant by the migration.
8. Verify at representative compact, tablet, laptop, and wide viewport sizes.
9. Run the relevant tests, lint, and build. Add or update tests for interaction behavior and regressions when warranted.
10. Update project documentation when implementation, user-visible behavior, architecture, dependencies, configuration, or documented file references change.

## 10. Definition of done for UI work

A UI task is complete only when:

- all affected routes and states use this design system, not only the default desktop view;
- shared tokens and components are used consistently;
- the layout works without unintended horizontal overflow;
- keyboard navigation, focus, semantics, labels, contrast, and reduced motion are verified;
- loading, empty, validation, error, success, and disabled states are coherent;
- editor UI does not leak into generated PDFs;
- obsolete CSS created by the change is removed;
- relevant automated checks pass;
- `README.md` is synchronised in both English and Polish whenever the implementation or user-facing behavior changed.

## 11. Prohibited patterns

- Applying the Swiss system only to the landing page.
- Route-specific visual languages for login, registration, editor, AI tools, or dialogs.
- Pure-black decorative slabs, gradients, glassmorphism, neon glows, and oversized soft shadows.
- Arbitrary border radii or spacing values that bypass tokens.
- Generic grids of identical cards when content hierarchy differs.
- Emoji used as UI controls.
- Placeholder-only form labels.
- Hover-only functionality.
- Color-only status communication.
- Full-screen unexplained spinners.
- Modal nesting.
- `100vh` layouts that fail on mobile browser chrome.
- Animation that blocks interaction or ignores reduced-motion preferences.

## 12. Product fit

The system supports CV Studio as a professional document tool: the interface is rational, calm, precise, and subordinate to the user’s content. Marketing pages may be more expressive and editing tools more compact, but both must visibly belong to the same product through shared typography, color, grid, components, and interaction rules.
