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
  editorInk: "#674E3E"
  paper: "#FFFFFF"
  canvas: "#F5F1E8"
  editorCanvasBase: "#DDE0E3"
  editorCanvasOverlay: "rgba(255, 255, 255, 0.58)"
  surface: "#ECE8DF"
  muted: "#686868"
  border: "#C9C5BC"
  accent: "#8A664F"
  focus: "#155EEF"
  canvasElementLight: "#2563A6"
  canvasEntryLight: "#467DB5"
  canvasSectionLight: "#5B81AD"
  canvasElementDark: "#8CC8FF"
  canvasEntryDark: "#A5C9F5"
  canvasSectionDark: "#75B3EF"
  success: "#18794E"
  warning: "#9A6700"
  danger: "#B42318"
  modalBackdrop: "rgba(255, 255, 255, 0.84)"
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
  canvasTool: "999px"
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
  editZoom: "500ms"
  easing: "cubic-bezier(0.2, 0, 0, 1)"
elevation:
  popover: "0 12px 32px rgba(22, 22, 22, 0.16)"
  editorEntry: "0 5px 14px rgba(22, 22, 22, 0.17)"
  editorActive: "0 4px 12px rgba(21, 94, 239, 0.22)"
  editorSkillsActive: "0 0 10px 1px rgba(21, 94, 239, 0.22)"
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
6. **Consistency across equivalent display modes.** The same semantic canvas record uses the same structural toolbar, labels, action order, and keyboard behavior in every visual representation. Mode-specific geometry is handled behind those shared actions rather than exposed as a separate control variant.
7. **Density follows the task.** Marketing surfaces may be spacious; editor surfaces may be compact. Both must use the same tokens and hierarchy.
8. **Accessibility is part of the system.** Contrast, keyboard access, focus, semantics, target sizes, reduced motion, and zoom support are release requirements.

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
| `editorInk` | `#674E3E` | Dark editor-route tone derived from the brown accent for text, actions, and application chrome; never document pixels |
| `paper` | `#FFFFFF` | Primary light surface, inputs, dialogs |
| `canvas` | `#F5F1E8` | Application background and warm neutral field |
| `editorCanvasBase` | `#DDE0E3` | Cool grey base behind the A4 document only |
| `editorCanvasOverlay` | `rgba(255, 255, 255, 0.58)` | Translucent white layer that softens the editor canvas base |
| `surface` | `#ECE8DF` | Secondary panels, selected or grouped regions |
| `muted` | `#686868` | Secondary text that still meets contrast requirements |
| `border` | `#C9C5BC` | Dividers, input borders, structural rules |
| `accent` | `#8A664F` | Restrained brand emphasis and selected accents |
| `focus` | `#155EEF` | Keyboard focus ring and interaction visibility |
| `canvasElementLight` / `canvasElementDark` | `#2563A6` / `#8CC8FF` | Solid field-hover outline on light / dark template surfaces |
| `canvasEntryLight` / `canvasEntryDark` | `#467DB5` / `#A5C9F5` | Dotted entry/group-hover outline on light / dark template surfaces |
| `canvasSectionLight` / `canvasSectionDark` | `#5B81AD` / `#75B3EF` | Dotted section-hover outline on light / dark template surfaces |
| `success` | `#18794E` | Confirmed success only |
| `warning` | `#9A6700` | Recoverable risk or attention only |
| `danger` | `#B42318` | Destructive actions and errors only |
| `modalBackdrop` | `rgba(255, 255, 255, 0.84)` | White wash behind every modal dialog |

Rules:

- Use `ink`, not pure `#000000`, for large dark surfaces and primary text.
- On the editor route only, substitute `editorInk` for `ink` across application chrome, including portalled dialogs and tools. Landing, authentication, and user-authored A4 document pixels continue to use their own tokens and persisted colours.
- Compose the editor workspace behind A4 from `editorCanvasBase` and `editorCanvasOverlay`; keep `paper` on the document itself so application chrome cannot alter PDF output.
- Body text must meet WCAG AA contrast at minimum. Target AAA for ordinary body copy where the palette permits it.
- Never communicate status by color alone; pair it with text and, where useful, an icon or shape.
- Semantic colors keep their meaning everywhere. Do not use danger red as decoration or focus blue as a brand accent.
- Every modal backdrop uses `modalBackdrop`. The editor ink scope must not recolor it; modal context is subdued with a consistent translucent white wash on every route.
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
- Contextual section and record toolbars on the A4 canvas are the narrow exception: their buttons grow gently with canvas zoom using scale = (2 + zoom / 1.4) / 3: 36px targets, 16px icons and 14px text at 140%; 48px targets at 280%. Labels, icons, padding and menus grow together, with a 12px text minimum and screen-stable focus outlines, while keyboard access and persistent panel alternatives remain available.
- Section and record toolbars align their left edge with the live rendered left edge of the text they control. Their bottom edge touches the top of those glyph or field bounds with a 0px gap at every canvas zoom, so moving the pointer to actions does not cross an adjacent entry. Clamp the toolbar inside an 8px viewport inset only when an edge would clip it; wrap oversized rows without shrinking targets. The toolbar never enters authored layout or PDF output.
- Inline language, Skills, contact, masthead, photo, and list-layout actions use the same zoom-growth rate as structural toolbars, with a minimum scale of 1: 36px buttons, 16px icons and zero surface padding at 140%; 48px buttons and 21.33px icons at 280%. Preserve a 36px minimum target when zooming out, borderless circular action buttons inside rounded surfaces. This user-requested canvas exception matches these actions to section/record controls; it does not apply to form inputs or submit buttons.
- Page gutters: 16px compact, 24px tablet, 32–48px wide screens.
- Section gaps: 48–96px on narrative pages; 16–32px inside working surfaces.
- Borders: normally 1px. Use 2px for strong selected states or focus visibility, not decoration.

### 3.4 Shape, elevation, and layering

- Default panels and cards are square: `0px` radius.
- Interactive controls may use up to `2px` radius.
- Pills are reserved for tags, status badges, and compact filters whose shape communicates containment, plus the scoped A4 editing-tool exception below.
- Contextual editing tools directly on A4 use the shared `canvasTool` radius (`--radius-canvas-tool`, aliased to `pill`): icon buttons are circular, labelled actions and toolbar rows are pill-shaped. This user-requested exception distinguishes transient editing actions from authored CV content. Toolbar surfaces have zero outer padding, so their full height matches the circular settings and inline actions: 36px at 140% and 48px at 280%, with a 36px minimum. Centre the add icon and label together. Cap the surface radius at half one control row (18px at 140%, 24px at 280%) for semicircular ends and usable wrapped corners; menus retain their independent inset. It covers section/record toolbars and inline language, Skills, contact, masthead, photo, list-layout and settings-cog actions in all states. Menus, tooltips, settings panels, forms and form controls retain standard geometry. Use shared settings-cog dimensions (36px at 140%, 48px at 280%, minimum 36px), borderless single-icon surfaces with zero padding, the shared palette, focus rings, placement and zoom rules; this styling never enters document layout, persistence or PDF output.
- Prefer borders, contrasting surfaces, and spacing over shadows in ordinary application chrome.
- If separation cannot be expressed otherwise, use one restrained shadow per rendered layer; do not stack multiple shadows on the same layer.
- Pointer-hover context on A4 uses one-screen-pixel blue lines without shadows or a lift: a solid line four screen pixels outside an individual field, a dotted line eight screen pixels outside an entry, and a dotted line twelve screen pixels outside a section. The larger structural offsets leave space between nested boundaries. These transparent, pointer-inert, out-of-flow editor layers retain a two-screen-pixel corner radius; they cannot change the authored box model, wrapping, hit area, persisted geometry, or PDF render tree. Use distinct shared `--color-canvas-element-*`, `--color-canvas-entry-*`, and `--color-canvas-section-*` blue tokens, with `light` / `dark` variants selected from the local filled template background. Photo and gradient pixels are not sampled; use the supported solid background regions with white paper as the fallback. Skills names and bodies follow the same solid field-hover rule. Selection and edit-focus geometry stay square. A selected or focused inline `textarea` retains the screen-stable `editorActive` shadow to expose its multi-line bounds; Skills category names and body textareas retain the centred `editorSkillsActive` shadow in those active states only. The `editorEntry` shadow remains available for actual canvas controls. Selection uses a one-screen-pixel blue `focus` border in single, multiple, and moving states, while focused inline `text` and `textarea` edit surfaces use a one-screen-pixel blue `focus` outline. The A4 surface compensates for zoom so hover offsets, corner radius, line width and active textarea elevation keep stable screen-space sizes. Render hover borders at 1px inside an expanded pseudo-element with a local inverse transform; this avoids Chromium rounding a fractional border before page zoom.
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

Public and account routes use the shared warm `canvas` backdrop with `paper` content and `surface` supporting regions. The shared page hero pairs its title and optional primary actions with a useful contextual note, rather than leaving a full-width empty field. Pricing contrasts a paper Free panel with an `ink` Pro panel; inverse secondary actions retain paper fill and ink text. Help uses a numbered in-page navigation beside reading sections, stacking in DOM order on compact screens. The library keeps compact document rows, visible actions, labelled filters, and contextual empty/retry states. Account usage uses native labelled meters only for known positive finite allowances; unlimited, unavailable, and zero allowances remain explicit text. Settings group sign-in and data controls, with permanent deletion separated by a structural rule. All surfaces reuse global tokens, square geometry and shared site primitives; these treatments never enter CV templates or PDF output.

Landing, onboarding, and explanatory pages may use generous whitespace and asymmetric editorial compositions. Prefer split layouts, staggered content, and strong typographic anchors. Avoid generic three-card feature rows.

Account onboarding is shown only to authenticated users and is the canonical destination of generic **Create CV** entry points, including shared navigation and the document library. Guests enter A4 setup/editor directly, while contextual template actions keep the selected template and open setup without an extra choice; refresh restores a guest's browser draft. Guest import keeps its Topbar trigger but opens the shared account gate with explicit registration/login copy and a preserved import intent, without mounting the upload UI. Cancel/Escape restores focus and preserves the document.

Authenticated onboarding presents three ordered choices: manual CV setup, PDF import and a highlighted interview card using inverse editor ink/paper tokens. The third card shows Pro availability to Free users and links to the account plan; only a resolved server AI entitlement links directly to the interview. Unknown access remains neutral and cannot grant AI access. Use three columns on wide screens, two with the interview spanning the row on tablets, and one column on compact screens. Preserve keyboard order, 44px action areas, reduced motion and 200% reflow. These independent creation choices are the intentional three-card exception to the narrative-page guidance.

A full-screen onboarding decision surface replaces the complete editor shell until the user chooses a path. Editor navigation, tool rails, canvas controls, and persistent AI actions must not remain visible or keyboard-reachable behind it. Dialogs launched from onboarding may appear above the surface and must restore focus to their onboarding trigger when closed.

The landing hero presents the three Free templates (Sterling, Meridian and Linden) as selectable A4 previews, with Linden selected initially. CSS perspective communicates the active selection through a short 320 ms transition; there is no ambient rotation. The copy and CTA remain semantic HTML. Native radios provide keyboard selection, horizontal touch gestures retain vertical page scrolling, and reduced motion applies selection immediately. Compact layouts repeat the primary CTA after selection. Preview loading and image errors reserve the A4 area and never disable selection or navigation. Use the shared palette, geometry and one restrained elevation token per document preview; these transforms never enter the authored document or PDF tree. For a guest without a browser draft, activating a validated Free selection immediately creates the starter and focuses its name field. The shared setup owns pending and retry states; it must not require a second start click. Guests with existing drafts retain replacement consent and authenticated users retain optional setup. Invalid or paid hints open the ordinary picker and never bypass replacement consent.

Authentication forms precede supporting copy in DOM and visual order at every width. Share one token-based layout between login and registration, with 16px inputs, persistent labels, visible focus, 44px targets, and recoverable errors. The download registration path shows Free without plan-selection controls; ordinary registration retains plan comparison. Password registration creates an unverified account and keeps the requested workflow in an allow-listed browser intent until the one-time email link is consumed and login succeeds. Google authentication may establish a verified session immediately. The download intent survives authentication and resumes only after explicit ownership-and-download confirmation.

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

- Public navigation shares `SiteLayout`: Templates, Pricing, Help, account access, then Create CV. Library and account pages keep document navigation in a stable position and use the same tokens with compact spacing.
- The application-language selector appears once, in the landing-page header. Its persisted choice controls every route, but public subpages, authentication, account workspaces, the editor, demo, start chooser, and fullscreen setup do not repeat it. The separate new-CV language field controls authored document content and remains available in setup.
- `/app/documents` is the authenticated return destination unless an explicit start, document bookmark, or browser-draft ownership flow takes priority. Saved CVs have `/app/documents/:documentId` addresses. First save updates the address without remounting the canvas; route exits retain the unsaved-change guard.
- The editor exposes the full document library as a navigation link and retains an explicitly labelled quick-open dialog for in-context switching. “Continue latest CV” opens that exact document; “All documents” opens the library.
- Template cards link to their named detail pages. Invalid IDs show the route error surface; preview failure reserves the A4 footprint and never blocks navigation. Public information pages, the library, account limits, retrieval failures and retries share the same focus-visible and responsive contracts.
- `/privacy` is the published privacy policy and remains a flat, globally linked public route. It must identify the controller and contact channel, describe the implemented data flows, processors, transfers, retention and user rights, and stay synchronized with product changes. Authenticated users must be able to export their stored data and start permanent account erasure from `/app/account`. `/terms` is not implemented and must not be presented as an available document.

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
- An optional `DialogShell.headerAction` slot places persistent task navigation between the title and close control. New CV setup uses it for a solid editor-ink / paper **Wywiad AI** entry, centered on wide screens. Confirmed AI access opens the interview; Free shows **Tylko w Pro** and opens the account plan, while unresolved access offers a plan check. Remove duplicate body links. Preserve the title, action text and close target on compact screens; decorative icons and badge may disappear. Hide this entry for guests and during replacement confirmation, and disable it during document creation. Keep the action in the modal focus order and outside document/PDF content.
- Standard, decision, progress, loading, error, and confirmation modals use the shared translucent white backdrop token. Fullscreen workflows cover the viewport with their own paper surface and must not introduce a tinted backdrop.
- New CV setup is an opaque, edge-to-edge fullscreen decision surface with one primary action: start editing. Show the three Free templates first, with additional templates available on demand and Pro restrictions retained. A validated landing selection auto-starts only for a guest without a browser draft; all other entries retain the compact selected-template state with an explicit Change template action. A failed automatic start exposes the same editable settings and manual retry, without automatic retry loops. Default fields and sections come from the shared starter configuration. Customize content replaces the gallery with switchable header/contact and ordered-section views; social links have a separate disclosure, name is always included, and photo controls appear only for supported templates. Retain choices across collapsed settings and retries; invalid section selection reveals settings and focuses its labelled error. Keep the configuration summary in the contact settings. Use compact selectable template rows and a single labelled A4 sample sized to the viewport. Default setup and ordinary settings fit laptop and wide desktop viewports without scrolling; sections use two columns in row-major order with 44px reorder controls. Compact layouts expose the sample on demand in place of the form and keep its toggle and the main action reachable. Preserve the shared body scroll fallback for short screens, 200% zoom, errors and additional custom sections instead of clipping content. Image loading/failure reserve A4 preview geometry without blocking selection or creation. Use native radios, labelled disclosure buttons, a single scrolling body, persistent actions, and 44px targets. Only the short replacement confirmation remains a floating modal. Setup uses white paper, brown headings/actions, and beige only for selection/hover. Creation focuses the name field; all controls remain outside the document and PDF tree.
- New-CV replacement confirmation uses the compact `decision` dialog and hides the floating property inspector. It prioritizes returning to the active CV. Its copy distinguishes the single browser draft from the last server-saved account version and from an unsaved account document. Close, Escape and setup cancellation retain active content in the editor; only an empty guest session returns to landing. A recoverable guest draft exposes a direct resume link on landing. Selecting a template does not replace content until creation succeeds.
- The built-in demo is product-owned sample content, not an active user document. Starting a personal CV from the demo opens setup directly without replacement or unsaved-work confirmation; user-authored active documents retain that protection.
- Short account-required choices use the shared `decision` dialog variant: an uppercase task label, action-led title, concise consequence, and no more than two structured facts before the footer. The primary account action receives initial focus; login remains secondary and returning to the editor remains a visually tertiary escape. On compact screens the facts and actions stack in DOM order, retain 44px targets, and keep the complete decision inside `100dvh`.
- Browser-draft ownership prompts use the same `decision` hierarchy but name the found document and compare the exact load/delete consequences. For a download return, the initially focused primary action explicitly combines ownership confirmation and PDF download; other returns only load the draft. No authentication event alone may export or save a document. Loading is otherwise the initially focused primary action; deletion uses an explicit danger label and states that recovery is impossible. Close, Escape, backdrop click, and “decide later” dismiss without deleting the browser copy.
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
- Save and PDF download use the same three-stage progress grammar with operation-specific copy, destination, icon, and side effects. Save reports preparation, persistence, and revision confirmation; download reports page preparation, server rendering, and the browser handoff. After a successful operation, each truthful stage remains visible for at least 1.2 seconds. A presentation timer may advance only after the corresponding real boundary; it never delays network work or the browser download, announces a boundary early, or extends failures.

- Unsaved-work confirmation protects a new account CV before its first server save and a saved CV only while its persisted snapshot differs from the confirmed version. Unchanged load, focus/blur, selection, zoom and page navigation must not manufacture edits. Preserve saved textarea geometry until text, typography or width changes; normalize legacy load repairs before establishing the comparison baseline. Copy distinguishes loss of the entire new CV from loss of changes to an existing version. Failed saves and edits arriving during a save remain protected. Use the shared dialog, safe initial focus, 44px actions and consistent visual/keyboard order, including compact and 200% zoom states. Guest draft persistence retains its separate policy.

### 5.7 Editor and PDF canvas

- The document remains the dominant object; chrome must support it rather than compete with it.
- Editor chrome uses the warm dark-brown `editorInk` token instead of near-black `ink`. The route scope includes topbar, sidebar, controls, AI surfaces, feedback, dialogs, and all interaction states, but excludes the authored A4 document and its PDF output.
- The field behind the A4 document uses the cool-grey `editorCanvasBase` with the translucent white `editorCanvasOverlay`. This treatment belongs only to the editor workspace; onboarding and document pixels retain their own surface tokens.
- Selecting or directly editing an element shows a settings cog that grows with structural toolbars (36 px at 140%, 48 px at 280%) to its left, normally with an 8 px gap. Use live glyph bounds for zero-height baseline text, clamp partially clipped selections inside the canvas, and hide the cog for fully offscreen selections. Settings open only on explicit activation and reset closed with a different selection. The contextual desktop form prefers 344 px width and caps height at 480 px; below 720 px it becomes a bottom sheet capped at 46dvh / 420 px, with view-only scrolling to reveal the selected field above it. Reuse shared canvas-control chrome for the trigger, white grouped form surfaces, 12 px field labels, 36 px targets, and a persistent close control. Pointer opening preserves the caret; keyboard opening focuses the nonmodal dialog. Escape/Close restore trigger focus without clearing selection or exiting edit zoom. The opened form sits above structural hover controls so they cannot obscure its fields; inline-range formatting remains independent. All settings chrome stays outside document layout, persistence and print/PDF output.
- Selection affordances, resize handles, alignment guides, insertion controls, and AI correction highlights must use a coherent interaction language and remain distinguishable from document content.
- Populated single-line text uses its visible glyph bounds for selection and edit-focus outlines, including when an authored full-column frame centres or right-aligns it. Both states keep the same two-screen-pixel breathing room so moving focus to a canvas control cannot shift the boundary onto the glyphs. Keep outline padding screen-stable during zoom; empty starter fields use their live, lifted CSS guidance box with the same padding, not the saved PDF baseline. Measure selection after DOM updates so closing settings or deleting text cannot leave a stale frame. These measurements must never change the alignment frame, caret, saved geometry or PDF output.
- Pointer-hover section and entry context uses the shared dotted blue outlines at twelve- and eight-screen-pixel offsets; an individual field uses a solid blue outline at a four-screen-pixel offset. Distinct blue shades adapt to the local solid template background. Do not add hover shadows, filled plates, or a selected-hover translation. Selection and inline-edit focus use the screen-stable hairline borders defined above; selected and focused inline textareas retain their active shadow to expose their full editable bounds. All of this chrome must stay outside layout, persistence, and PDF output.
- Canvas zoom, page boundaries, page numbers, and active selection must be readable at every supported scale.
- The standard single-page canvas view starts at 140%. Entering inline text edit changes it to 280% with one coordinated 500 ms motion, exactly 2.5 times the standard 200 ms duration: the edited field moves into the viewport while the A4 scale changes, never as a completed zoom followed by a second delayed scroll. Returning from temporary edit zoom uses the same duration and easing. The field follows one continuous path towards the vertical centre, retains nearest-edge horizontal visibility, and stays view-only so saved geometry and PDF output are unchanged. Use the dedicated shared `editZoom` motion token; reduced motion applies the final zoom and reveal without animation.
- Temporary inline edit zoom ends only after a direct click on an unoccupied part of the A4 paper. Scrolling, canvas gutters and scrollbars, application chrome, the AI assistant, contextual controls, and clicks on authored document elements may move focus or finish text input, but they must preserve the focused zoom until that explicit paper-background click.
- The topbar keeps template navigation centered on the canvas viewport, with paired undo/redo beside creation on its left and page navigation, zoom and the two-page toggle grouped on its right. Reserve equal side tracks around templates and a rail at least 960px wide where space permits; its reference is independent of live zoom, scrolling and spread mode. Creation remains separate on the far left; the right-hand output sequence is clear, document name, save and download. At 1600px and below, outer groups stack in DOM/keyboard order; at 1100px and below, the canvas groups stack too. View controls wrap as logical pagination and zoom/spread clusters without shrinking compact targets. All chrome stays outside authored document geometry and PDF output.
- Hover-only tools must also be reachable by keyboard or through a persistent control path.
- All contextual canvas toolbars share `CanvasControls.module.css`: white paper, editor-brown foreground, borderless rounded toolbar surfaces and circular icon buttons, entry-level shadow, and the same surface-coloured hover/press background. Destructive icons retain the danger foreground with the same base hover. In-page inline controls inverse-scale geometry and elevation. Structural portals resolve screen-pixel dimensions from the live A4 transform with the shared zoom-growth helper, including animation frames; never multiply inverse-zoom layout metrics by a second transform. Ancestor fit and assistant transforms affect anchor position only. Inline portals use the compact screen-space growth helper. In-page controls use the live A4 zoom context, committed before paint on every animation frame; never inverse-scale against the destination zoom while the page is still animating. Open forms keep their independent screen-stable dimensions. Masthead identity, title, contact, and photo controls share the toolbar tooltip primitive in `CanvasControls.module.css`: editor-brown background, white UI text, square corners, delayed hover/focus-visible activation, and no native title bubbles. In-page tooltip metrics inverse-scale with A4; accessible button names remain independent of hints. Structural labels, tooltips and regular-weight AI/delete menu text grow with their toolbar, with a 12px minimum; menu rows remain at least 36px. Inline labels and tooltips grow with compact actions, with a 12px minimum.
- A contact delete surface is centred on both axes over that contact's live hover bounds: the complete field box for wrapped contacts, and the visible glyph rectangle for single-line contacts. Moving to the trash must stay within the same contact instead of crossing a neighbouring row. If the band-end add surface would overlap the trash, move only that add surface to the right with an 8-screen-pixel gap. The surface claims the shared canvas-toolbar slot and remains mounted while its button has keyboard focus. The visible job-position hide surface stays completely outside the title with an 8-screen-pixel gap. Both rules remain zoom-stable and editor-only.
- Masthead actions follow the element they affect: the name-case toggle sits outside the upper-left glyph corner with an 8px screen-space gap (above or left when a page edge limits space); the add-title button is centred in the saved title field/decorative band; hidden-photo restoration remains visible above the saved photo slot, clear of relocated contacts. Reuse compact controls (36px at 140%, 48px at 280%), preserve keyboard access, and keep all positions editor-only. Disabling uppercase must visibly restore ordinary name casing even when PDF extraction stored the source name entirely in capitals: normalize that all-caps source once to Unicode-aware word casing, persist the repaired content, and leave already mixed-case spelling untouched.
- The main-column Skills section toolbar exposes its style picker as a separate grid icon after reorder and before AI/overflow. Its shared tooltip and accessible name include the current style; Enter/Space opens a non-modal panel beside the canvas. The panel contains exactly nine native radio choices in one 3×3 system: inline, bullet list, and seven persisted chip treatments. Inline previews one mid-dot row, list previews multiple rows, and each chip choice previews one fixed word in the actual treatment. Use a readable shared panel header (18px title, 14px help, 44px close target), 14px option names and previews, and 12px secondary copy. Name chip shape and finish on separate lines; omit decorative numbering and repeated selection instructions. Short fixed Excel / SQL samples must fit without truncation; sample corner geometry may mirror the authored chip treatment. Mark selection with a two-pixel border, a checked indicator and one persistent current-style announcement. Keep the native fieldset name accessible, reveal the selected option when reopening a scrolled panel, and use two columns below 480px. Selection applies immediately while the panel remains open for comparison. While this picker is open, hide the closed AI assistant's floating launcher to keep the current-style footer unobscured, while preserving mounted history and the close control of an already open assistant. Let desktop height follow content up to its limit rather than leaving an empty footer area. Bound the panel to the photo gallery's maximum `460px` width and `70vh`/`70dvh` height; use the same right drawer geometry on compact screens. Opening and closing animate opacity only, never position; reduced motion applies the final state immediately. Closing restores the original trigger or section-heading focus if the transient trigger has unmounted. Keep the shared zoom-responsive structural geometry and exclude all panel chrome from PDF output.
- The Skills add form is labelled “Dodaj umiejętność”, uses application UI typography, an optional category context, a full-height 44px input and text-labelled “Dodaj” action, a separate close control, and concise keyboard hints. Preserve empty/disabled, duplicate/error, success announcement, Escape cancellation, and focus restoration states. Its open panel stays within the viewport, including when validation changes its height.
- Hovering an individual skill overlays its zoom-aware compact trash (36px at 140%, 48px at 280%) directly on the right end of that skill's entered glyph line or chip in inline, bullet, and all chip treatments. Freeze the entered fragment while approaching the button, preserve the target over separators, and follow live scrolling/zoom without an entry animation. The plus stays centred on the group. Both controls share the entry hover lifecycle and exclusivity; keyboard Tab/Shift+Tab connects their separate portals, and Left/Right chooses a skill. Use the shared canvas button/danger tokens, a short edge-aligned tooltip, and the full skill name in the accessible label. Delete only that skill, retain category and neighbouring formatting, and offer the shared Undo toast. Deleting the last skill leaves empty editor-only guidance with a usable add control. Targets, hit-test geometry and toolbars never enter persistence or PDF output.
- The Add Section dialog exposes concrete CV section types rather than implementation layouts. Every choice previews its real information hierarchy, uses the shared empty-CV field guidance, and remains a keyboard-operable radio card at desktop, tablet, mobile, and 200% zoom.
- Languages entry actions stay centred 18 screen pixels below each cell at every canvas zoom. This applies equally to generated language grids and the Languages preset created through Add Section, including reopened documents and renamed headings. Other custom grids retain their gutter placement; presentation must not alter their persisted data semantics.
- Dragging must provide visible origin, current target, and invalid-drop feedback.
- UI styling must not change printed dimensions or leak into PDF export.
- Combined record metadata uses one inline edit surface: Experience has three independent hints (company, location, period) and two structural middle dots; Education has two (city, period) and one dot. A hint remains visible on focus and disappears only when its own slot has text. Clicking a hint places the caret in that slot; Tab and Shift+Tab move between slots, then leave the field. Empty slots remain available on the canvas and are omitted together with unused separators in the render-only PDF copy. This contract excludes rail layouts such as Meridian, separate metadata fields, and other sections. Education degree and school fields retain their existing behavior. Hints are editor-only pseudo-content without added underlines; the field retains a persistent accessible name. The active empty slot has a steady focus-colored caret at its beginning and its hint uses `--color-placeholder-active` (muted color at 40% opacity). This user-requested contrast exception applies only to the active hint: the field keeps its accessible name, other hints retain muted contrast, and leaving the slot restores its hint. The caret, separators, pulse background, and authored text are never faded; populated slots retain a native focus-colored caret. Neither cue alters document layout or saved text. At edit entry, empty hints may pulse their focus-soft background twice over 1.28 seconds, keeping text fully readable; reduced motion removes this cue. At 280% edit zoom, the page wrapper must retain its scaled scroll extent and oversized pages must align inside the scrollable viewport so clicking or tabbing to a hint can reveal its insertion point.

### 5.8 AI workflows

- AI functionality uses the same components and hierarchy as the rest of the product; it must not introduce gradients, glowing borders, or a separate “magic” visual language.
- The editor assistant is operated only through named quick actions and their task-specific subflows. It has no free-form message composer, custom-prompt keyboard shortcut, send control, or composer-local sensitive-data notice. Structured quick-action forms may collect only the inputs required by that named workflow. Opening the assistant focuses its first available quick action; closing it restores the opener.
- Clearly distinguish user input, generated suggestions, pending work, applied changes, and errors.
- Applying generated content must show the scope of the change and provide undo when feasible.
- Loading copy must describe the current operation without pretending to know an exact completion time.
- **Check CV / Sprawdź CV** presents a read-only audit of contact details, summary, experience, achievements, skills/languages, education, grammar, language style, consistency/chronology, conciseness, content structure and privacy. Show ATS PDF readability and job fit as separate, explicitly unassessed categories with links to their existing workflows. The audit uses counted findings rather than an unsupported percentage. Distinguish errors, improvements, missing information and facts to clarify; zero findings and an unassessed category must never share the same success label.
- Audit categories use native disclosures with visible counts and concise summaries. Each finding identifies its location, priority, quoted source where available, reason and concrete next step; missing facts include a useful question. Priorities navigate to the relevant finding without starting AI. Tool recommendations use the existing named actions and explain their scope and credit consequence. Opening translation, matching or interview only opens that workflow; audit questions are never silently saved as candidate facts. Keep strengths and assessment limits readable, status text independent of colour, 44px actions, focus-visible states and wrapping text at compact widths and 200% zoom.
- A completed audit receives heading focus at the start of its report. Returning from an interview or matching workspace restores the originating recommendation. A changed document makes the retained audit stale and disables its outdated tool actions while preserving readable findings and a fresh-audit action. Pending and failure states preserve history; retry is explicit. Audit metadata, counts, quotes and controls remain outside the document/PDF tree, and neither a fresh nor replayed audit may expose applicable document operations.
- Only active Pro (formerly Premium) accounts with the server `scoped_ai` entitlement see scoped AI controls. Free, unresolved, and revoked access hide the trigger, menu, and panel without changing structural actions.
- Only section and record toolbars expose an AI icon immediately before overflow. Experience, Education, and Skills category records retain it; individual Languages/grid cells and the Skills add control never expose AI. Flat Skills and other non-record content use their section toolbar. It opens exactly three text actions: “Skróć”, “Popraw styl”, and “Polepsz”. AI and overflow menus are mutually exclusive; menu rows use at least 12px text and the compact control height even though their toolbar trigger retains the smaller canvas geometry.
- Scoped AI review opens the current-result workspace inside the existing AI assistant, never a separate panel or modal. Earlier results remain available through the explicit history view. Toolbar actions open the assistant directly at their review. Use the shared 200 ms motion and honor reduced motion. The review names its operation and scope, compares “Przed” and “Po”, and offers explicit application. Opening scoped review temporarily hides structural canvas toolbars and the inspector; closing the assistant restores trigger focus. Use the same responsive assistant shell at every viewport. Keep quick-action and scoped history across template changes, but disable historical canvas actions after the document epoch changes. A different document starts a fresh history.
- “Skróć” preserves every distinct fact; “Popraw styl” preserves meaning; “Polepsz” strengthens only supported claims. Missing achievement evidence appears in a separate “Wzór do uzupełnienia” with questions and a copy action, never in the applicable text. Character-count changes are calculated locally and are not promises about PDF page count.
- Stale source text or record context disables application and offers regeneration. Empty, unavailable, pending, failure/retry, rejected, and applied states must remain explicit. Applying all pending scoped corrections is one undoable editor transaction. The panel and all proposal metadata remain outside the document and PDF render tree.

### AI task navigation and review

- The start surface prioritises Check CV, Improve content and Tailor to a job. Interview, Translation and ATS remain visible secondary shortcuts. Opening the assistant or its history never starts paid AI.
- Show one working view: tools, configuration, current result or history. Hide the tool menu during a result; a labelled return restores tools. The working body owns vertical scrolling. Keep offer drafts when navigating back. The resume action returns to the latest result or pending operation.
- Audit reports lead with the actual finding total, assessment coverage and up to three priorities. Full counts, categories, strengths and limitations remain available in an explicit disclosure; priority activation opens its containing disclosures and focuses the finding without starting AI.
- Global and scoped text proposals share the same before/after disclosure, with the first proposal open and explicit Apply/Skip actions. Hover never expands, moves or scrolls proposals. Keep complete source text and visible applied/skipped states. Validate the original document scope and text before applying; accepted replacements from this review remain valid while unrelated text edits make it read-only.
- The interview uses four existing stages. In narrow containers use a labelled native stage selector with the same transition restrictions as desktop buttons. Ordinary questions put alternative answer meanings under Other answers; factual clarification quotes and explicit confirmation remain always visible.

### Job matching workspace

- Offer input uses a labelled native radio group, Link or Paste text. Retain both drafts, but bind requests and analysis reuse to the selected source only. Analyse is primary before a result; Interview is primary afterwards. Keep charges and optional notes accessible.
- “Dopasuj do oferty” replaces the quick-action grid and chat with one full-width, full-height assistant body below its header. Use 16px body/inputs, 24px task heading, 44px actions, shared tokens and a single vertical scroll container. Back restores the assistant actions and focus; drafts and the current analysis remain available. Analysis results receive heading focus, use plain matched/needs-detail/not-mentioned labels, and never expose technical source types, evidence IDs, raw diagnostics or correction cards. Compact/200% layouts wrap without horizontal overflow.
- Offer input accepts a link or pasted description with optional experience notes in a disclosure. “Tylko analiza” reads fit without changing CV content. “Dopasuj z wywiadem” is the only job-tailoring path and produces a separate reviewed CV. Explain AI credits and reuse of an unchanged completed analysis without a second analysis charge.
- Tailoring discovery is driven by the saved offer analysis, not generic CV records: offer exactly two questions per missing/partial requirement, within the shared 50-answer ceiling, with no third follow-up. Use the current CV, optional explicitly chosen career profile and saved answers as context. Matched requirements are skipped. No experience, cannot remember and skip close that requirement immediately. Stable requirement IDs and saved answers prevent repeated topics on retries or extension. Source refresh invalidates the analysis while retaining answers; no analysis classification becomes a career fact.

### 5.9 Career interview contract

- Eligible narrative questions expose **Zaproponuj odpowiedź / Suggest an answer** beside the answer field. Keep the form and credit receipt visible while generating and independently checking a suggestion. Show either a labelled grounded draft, hypothetical tasks as initially unchecked native checkboxes, or nonapplicable guidance. Using a suggestion only appends selected text to the editable answer; it never submits, advances or changes facts. Preserve existing input and reject an insertion that would exceed 4000 characters without truncation. An assisted draft uses **Potwierdzam i zapisuję odpowiedź / Confirm and save answer**, with adjacent copy confirming the entire answer. Ordinary typed answers retain the ordinary Save action. Exact factual questions and clarification decisions do not offer generated answers. Reopening cached help is free; hiding pending help only dismisses the review while the request and its credit accounting continue. Keep duplicate actions disabled, preserve drafts and choices on failure, provide explicit retry, focus the opened review/result and restore the answer field after insertion. Use the same token-based panel in standalone and embedded interviews, with 44px targets, keyboard access, PL/EN, compact layouts, 200% zoom and reduced motion. All suggestions, flags and controls stay outside CV/PDF content until the user explicitly confirms the answer.

- When a verified interview result still spans multiple pages, compare other entitled templates using the same complete content, actual loaded fonts, each template's S preset and compact spacing. Announce only measured single-page alternatives and require an explicit template choice. The scan and selection use no AI credits. Keep the current result readable and saveable during comparison, with a real completed/total count, cancellation, retry, empty and partial-failure states. Existing saved previews expose an explicit check; a newly generated or corrected multi-page result starts one free comparison. Template sample thumbnails must be labelled as examples, while page-count claims come from the candidate's actual content. Preserve keyboard selector access, task focus, 44px actions, PL/EN parity, 200% zoom and reduced motion. Changing templates stores matching template identity, spacing and geometry together; restoring the previous version also restores its template. Invalidated or edited previews cannot apply stale recommendations. Comparison controls and samples never enter the PDF.

- After verified multi-page generation, finish automatic layout fitting before revealing the result or enabling final save. Use the existing template spacing and S typography transactions, preserving the template's identity. Automatic spacing stops at the compact preset; try at most three fact-checked shortening rounds only when measured editable prose can plausibly recover a page. Retain the complete verified baseline and offer a free restore action. Keep the existing preparation/loading/result surfaces, 44px controls, PL/EN copy, focus restoration, responsive reflow and reduced motion. Explain additional shortening/verification credits before generation and include both stages in receipts. Reads, navigation, answer saves and manual review must never start paid fitting; manual review permits free geometry work only. Interrupted fitting returns to preparation with explicit resume/restore actions. Persist final content, elements, spacing and page count together. These controls and diagnostics never enter the PDF.

- The account career profile uses an explicitly selected saved CV or successful import for every structured CV section. Persist source choice immediately, replace the source snapshot on selection, and refresh saved data on return from the editor. Structured fields are read-only with an editor link; imported snapshots link to the existing import history and become editable saved CVs through that workflow. Only interview information and notes allow local edits, Apply/Cancel, delete/undo and explicit save. Preserve legacy manual entries as notes, their IDs/prompts/kinds, and unsaved note drafts during source changes. Disable source selection during an open note form; prevent stale writes. Missing/deleted sources show recovery without choosing another source; clearing the profile also clears the binding. Use a compact labelled native selector and shared tokens, reflowing actions on compact screens. The shared fact form never asks users to classify information as fact/gap/framing: new notes default to fact, existing meaning survives, and explicit interview no-experience/unknown/skip actions retain their semantics. Neither account notes nor interview review exposes CV field assignment. The shared fact editor enforces read-only source fields in every entry point, including isolated interviews and the embedded assistant; this is not an optional caller mode. Only notes and answers expose edit/delete actions. Existing interview-answer bindings remain internal for generation and clarification. Provide a source-editor link or return action, and block source refresh while a note form or unsaved note changes remain. These source operations do not spend AI credits or alter document/PDF output.

- The shared interview workspace shows actual credits charged for the last AI request, the interview total and the known account balance in both assistant and account entry points. Keep the receipt visible above waiting and working panels. Show an explicit pending/unavailable state instead of inventing a price or zero balance. A keyboard-operable history groups preview charges into drafting, editing and verification; failed metered stages remain visible, and replayed stages are never counted twice. Explain that saving answers, facts and clarifications costs zero credits. Refresh receipts after success and failure, preserve the last known amounts with a stale-data notice on read failure, and provide a read-only retry. Use shared tokens, compact wrapping typography, PL/EN plural forms and a polite status region without moving focus; receipt data never enters PDF content.

- Interviews and career-profile editing enrich existing CVs. Require a saved CV, a successful nondeleted import, or the active editor CV with a nonblank candidate name; empty templates, notes and account facts alone never unlock the workflow. Do not offer blank-candidate or unbound-profile starts. The standalone source selector offers Career profile only when its saved CV/import binding is available. Selecting it includes profile notes and answers without another opt-in; the server resolves the current owned binding again at Start. Selecting another CV/import restores isolated scope by default. The server supplies eligible owned source choices and enforces the same rule before session creation, source refresh and profile writes. At `/app/interview` and `/app/career-profile`, show the shared source-required surface with import/manual-creation actions instead of an empty fact editor. The assistant offers return to its current CV. Loading/error/retry states must not claim no sources until reads succeed. Preserve saved histories and personal-data deletion; historical sessions without source data require a new source-bound interview. Opening these surfaces never starts AI. Keep native labelled selection, 44px actions, keyboard access, PL/EN parity and responsive reflow; all chrome remains outside PDF output.

- Invite plain-language answers without judging competence by grammar. Submitted answers remain unchanged. Creation/enrichment prioritises populated work experience, projects, tools and contextual notes before education and missing-section invitations, preserving authored order within sections. The initial round allows eight main questions and ten answers including follow-ups. Roles/projects/notes have at most two main questions; education, skills, missing language levels and general invitations have one. Each scope allows one focused follow-up, never a chain. The next-question request assesses the last answer and may close sufficiently described scopes using current cited facts. Unknown, skipped and explicit no-experience meanings close a scope without inventing experience. Name a follow-up and its optional nature without presenting it as an error. No assessment is a career fact or a second approval requirement.
- Every newly generated preview runs drafting, separate professional style editing and independent factual verification against original evidence. Disclose all three paid stages before generation, without simulated stage progress. Style editing is automatic within the preview request, not on answer save, navigation or session read. A failed editing stage preserves saved work and exposes recovery; never publish unverified output. Existing previews stay readable. Resume completed stages only within the unchanged versioned attempt; claim free recovery only if all three paid stages were reused. Application guidance and diagnostics never enter the PDF.

- User-authored interview answers are confirmed by submission and persist immediately to the selected evidence store; never ask the user to approve the same text again in **Twoje informacje**. Text answers and explicit lack-of-experience choices update evidence atomically with answer history, while unknown and skipped answers create no fact. Initial source facts, refreshed-source proposals and manual fact edits persist through explicit stage navigation. Use **Przejdź do rozmowy** / **Przejdź do przygotowania CV** and name the selected store in adjacent save guidance. Unchanged navigation makes no request and preserves the preview. Keep full fact review optional after answers and clarifications. Do not start paid AI from navigation. Open field edits prevent transitions, failed saves retain the current stage/draft, and a synchronous lock prevents duplicate submissions. Account-profile management keeps its standalone save action.

- Selecting a CV/import defaults to isolated session evidence. Offer an unchecked, labelled **To moje CV — dołącz mój profil zawodowy** opt-in; selecting another source resets it and keeps notes as separate in-memory drafts per source. Account evidence is an optional same-person addition. A source-bound career profile is also an explicit selector option that resolves its linked CV/import; profile facts alone remain insufficient. Display the active scope in the existing compact status row and use **Tylko ten wywiad / Informacje do tego CV** in isolated fact review. No account facts may appear in isolated review, AI context, preview or save. Confirmation copy must name the selected store; account changes cannot invalidate another candidate's session. Scope is immutable after creation. A source identity change requires a new interview.
- Legacy sessions without an explicit evidence scope retain their data, but replace editing/generation with a clear explanation, a new-interview link and a disclosure of saved answers. Existing documents stay accessible from the library. Do not silently migrate mixed facts or historical answers into either profile or isolated evidence. Session deletion removes its isolated evidence; account profile and saved documents survive.

- The interview is a staged workspace: **Twoje informacje → Rozmowa → Przygotuj CV → Wynik**. Render only the active working stage. Keep the current question and required clarification together; do not expose preparation or final save while they are unresolved. Existing answer and field drafts survive in-flight requests and recoverable failures.
- The result offers **Treść CV**, **Zmiany**, and **Do sprawdzenia**. A labelled selector groups complete roles, education and language entries instead of repeating a disclosure per scalar field. Read one complete record at a time, with six list items per page; show at most five changes or outstanding gaps per page. Keep every underlying field and evidence reference. Group repeated correction notices by section and outcome. Pagination and view changes restore focus to the reading heading; save controls remain outside the content. In Changes, offer correction of one complete proposed text or rejection to its original/omitted state without AI credits. Identity/contact changes remain in the source editor. User corrections become cited information in the selected store and do not mutate the source CV. A labelled textarea receives focus; Escape/Cancel restores the edit trigger. Open drafts block stage/record/pagination changes and final saving. Disable duplicate actions, retain drafts after errors, and announce completed preview updates. Rejection of record identity removes dependent generated additions. Use existing buttons, form tokens and responsive layout; controls and evidence stay outside PDF content.
- Long operations replace the working panel with a compact operation-specific surface: a named indeterminate indicator, elapsed time and optional known context in a disclosure. Answer persistence, question requests, confirmation and synchronization keep the existing form mounted and visible, with its duplicate actions disabled and a compact status above it. Do not add decorative document illustrations. Distinguish answer persistence, AI questions, generation and profile synchronization using actual request boundaries. Never simulate server stages, percentages, countdowns or success. After 30 seconds, explain the continuing wait without automatically retrying. Omit unavailable counts; announce operation changes politely, not every timer tick. Disable duplicate actions, retain mounted drafts, restore task focus on completion and stop animation for reduced motion. The surface is shared by the standalone page and embedded assistant, and stays outside PDF content.

- Discoverability uses the existing site hierarchy: public pricing and landing explain the interview and link to bookmarkable help topics for the interview, tailoring and career profile. Canonical Pro copy is shared with registration and plan selection. State the shared credit pool and free profile management after Pro expires; never imply unlimited AI or a fixed number of interviews.
- Library and account invitations claim active Pro access only after the server AI entitlement resolves true. Keep manual starts, document navigation and profile management reachable. Invitations are links and never invoke paid AI automatically. Help topics use native disclosures for optional explanations, meaningful headings, fragment focus after client-side navigation, and the shared responsive guide layout. In-progress interview help opens in a labelled new tab to preserve the current form.

- Career facts are presented as complete path-bound roles, education records, language pairs, skill groups and custom sections. Do not render a separate section accordion for every scalar. Equivalent display rows retain every evidence ID; differing values remain reviewable. Narrative context never triggers heuristic merging into a role.
- Use the shared grouped FactEditor in account management and interview review: section navigation on wide containers, a labelled native selector in narrow panels, profile-wide search, six records per page and eight fields per selected-record page. Show only one field form, with Apply, Cancel/Escape and focus restoration. Disable outer persistence while a field draft is open; provide undo for the last information deletion.
- Keep advanced context secondary and stored fact meaning readable without an information-type selector, hide stored template metadata from career prose, and retain all source IDs on edits. Account profile and saved interviews use separate views with bounded lists. The shared compact SiteLayout introduction prioritizes task content. Save controls must not overlay the record being read or focused. All these changes remain outside CV template geometry and PDF output.

- Specific unresolved factual proposals lead to a clarification step before final preview; technical failures and collateral rejections use the confirmed fallback without a user question. Offer a voluntary round of up to five concrete questions and a clearly secondary explicit skip action. Never discard the candidate's answers or treat an unknown answer as lack of experience. Show one proposal at a time, a separate clarification position/total counter and the disputed proposal in an always-visible labelled quote. Never hide essential context in a disclosure or use “Treść CV” as its subject. Present the provider's question as **Co wymaga sprawdzenia**, not as the form's action question. The form asks one stable decision: **Czy proponowany opis jest w pełni zgodny z Twoim doświadczeniem?** The cumulative clarification budget is five answered or explicitly deferred questions per session; regeneration cannot reset it. Deduplicate question wording and claims across path changes, and repair resumed legacy queues without deleting saved answers or charging credits. A typed correction is confirmed when submitted and immediately replaces or creates the selected fact. **Tak — zatwierdź ten opis** remains the explicit confirmation boundary for the complete visible AI-authored suggestion. Either choice invalidates the previous preview before regeneration.
- A linked clarification edits the existing fact after review, rather than adding a second entry. Present two explicit primary paths: confirm the entire visible proposal, or reject it and enter a field labelled **Pełny poprawiony opis**. Explain beside that field that the user must provide the complete replacement, not only an answer to the provider's question. Disable proposal confirmation while a correction draft is present so it cannot discard that draft. Keep lack of experience, inability to remember and ending the clarification as a separate secondary group with their distinct consequences stated in prose. Existing answer status, loading/error recovery and focus contracts also apply to these actions. Ask only about material changes of meaning, not unstated frequency or an already confirmed role. Redundant generated bullets are handled during assembly, not as questions.
- Maintain a confirmed fallback internally for explicit skipping: keep the original field or omit an unsupported addition. Never expose this as the final result before offering clarification; do not repeatedly ask resolved topics. Starting saved questions and answering must not trigger paid calls. Explain that subsequent requested regeneration uses normal AI credits.
- Explain these corrections in a neutral, collapsible notice with human-readable section names. Raw provider diagnostics, evidence jargon and JSON paths must never appear in user-facing notices, including resumed legacy sessions. Recovery notices are informational, not danger alerts; genuine transport/validation errors retain the normal error contract.
- Local filtering and saved clarification questions must not trigger a paid retry. When the preceding settled generation can be recovered for an unchanged profile/source, state that recovery added no AI charge. Preserve keyboard disclosure activation and focus, mobile reflow and separation from PDF content.


- Tailoring and enrichment use the existing assistant shell; standalone creation and the career profile use `SiteLayout`. Reuse the same `InterviewFlow` and fact editor, global color/spacing/type tokens, rectangular controls and visible focus rings. Manual CV creation remains a parallel entry.
- Show one question in the selected interface language with its reason, saved-answer count and actual maximum plan: **Question X of up to N** or **Plan: up to N questions**. Include optional discovery follow-ups; exclude verification clarifications. Distinguish round completion from all-scope completion. At a round boundary, hide Next, retain preparation and offer an explicit extension only if scopes remain. Extension adds up to five slots and never reopens completed scopes. Source refresh and added facts cannot silently increase the round budget. Preserve legacy answers and their consumed capacity. All saved answers share a hard ceiling of 50; verification retains its separate cumulative five-question budget. Tailoring keeps two questions per unresolved analysed requirement and a pending-plan explanation before analysis. Text, explicit lack of experience, unknown and skip remain distinct; standalone typed equivalents receive consistent saved-state feedback. Invalid/repeated proposals use local fallback without a paid retry.
- Save each answer before another AI operation. Persist its user-confirmed evidence in the same version-checked transaction and announce the selected destination. Keep typed input on failure, expose a saved-state recovery action and provide a polite status region. Disable duplicate activation synchronously. Authentication/credit failures must retain the persisted session.
- Review source-derived and AI-authored proposed facts before they enter the selected evidence store. Do not classify submitted user text as a proposal requiring a second confirmation. Only an explicit account-profile choice permits writing answers or reviewed proposals to the shared profile. Editable interview notes expose content and optional context, retaining stored meaning and field bindings internally; every entry follows the source and notes boundary above; technical paths and IDs are never primary labels. Profile edits and deletion remain available without Pro. Destructive confirmation restores focus; deleting a fact focuses the remaining add control.
- A preview displays complete CV content, cited before/after changes, remaining uncertainties and the generated page count. Saving creates a separate document; changed source/profile state blocks stale application. Refreshing the selected source retains saved answers and notes, replaces the full source snapshot including removed fields without asking users to resolve conflicting source versions, and requires fact review; unsaved answer text blocks that action. An unknown template requires selection in the existing gallery. Preserve supported spacing, but regenerate geometry instead of copying manual element moves.
- Pending, empty, loading, validation, conflict, credit failure, provider failure, rejected proposal, preview and saved states use the same semantic structure. Every field has a label, status/error content is announced, and focus moves to the current interview heading after a phase change. The assistant restores its entry control on return.
- Controls wrap at compact widths and 200% zoom. Test 390, 834, 1280 and 1920px; avoid nested horizontal scrolling and respect reduced motion. Questions, source IDs, citations and review controls remain outside the PDF element graph.

## 6. Motion

Motion explains causality and state; it is never ambient decoration.

- Hover and press feedback: 120–200ms.
- Panels, dialogs, and route transitions: 200–320ms.
- Inline edit zoom in and out: 500ms, using the dedicated `editZoom` token.
- Animate only `transform` and `opacity` where practical.
- Avoid parallax, looping decoration, bouncy spring motion, and long staggered entrances in working UI.
- Respect `prefers-reduced-motion: reduce` by removing non-essential movement and making state changes immediate or nearly immediate.
- Never delay input, navigation, saving, or modal dismissal to finish an animation. The successful save-stage reading interval defined in section 5.6 is the sole feedback-timing exception and does not delay the underlying persistence request.

## 7. Content and iconography

- Public positioning distinguishes CV Studio (design, layout and direct editing) from the Interview (eliciting experience details, drafting, editing and factual checks). Give the Interview its own labelled section and an illustrative source/question/answer/result example before the Studio tools. Public navigation links to interview help; opening the account workflow never starts paid AI. One-page claims must remain conditional on measured content and template geometry. Explain free template comparison separately from paid text shortening and verification, with a dedicated help anchor. Preserve both languages, existing entry permissions and PDF isolation.


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


## Application language parity

Polish is the default interface language; English uses British spelling and en-GB formatting. Both languages use the same component contracts, tokens, routes, permissions and responsive behaviour. Use the shared native language selector only in the landing-page header and persist its choice for every subsequent route. Do not repeat it in public subpages, authentication, account workspaces, the editor, demo, start chooser, or fullscreen setup. A landing-page language change must preserve focus and scroll; entering another route must retain the choice. Store application messages as semantic keys when retained in state; render translated copy at the presentation boundary. Names and content in saved CVs, user answers and historical AI results are authored data. Document language is an independent new-CV choice that stays available in setup; interface localisation must never mutate canvas geometry or enter PDF content. Acceptance covers both languages at 390, 834, 1280 and 1920 px, keyboard access, 200% zoom and reduced motion.
