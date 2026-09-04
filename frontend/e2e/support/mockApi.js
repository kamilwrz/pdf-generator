import { expect } from "@playwright/test";

export const SAVED_DOCUMENT = Object.freeze({
  id: 41,
  title: "CV Smoke.pdf",
  created_at: "2026-09-01T08:00:00.000000",
  updated_at: "2026-09-01T08:00:00.000000",
  pages: 1,
  page_width: 595,
  page_height: 842,
  editor_mode: "template",
  template_id: "sterling",
  revision: 3,
  spacing_px: null,
  source_import_id: null,
  cv_data: {
    name: "Kamil Smoke",
    title: "Frontend Developer",
    summary: "Local Playwright fixture.",
    skills: [
      { category: "Narzędzia", items: ["Figma", "Miro"] },
      { category: "Technologie", items: ["React", "TypeScript"] },
    ],
    experience: [],
    education: [],
    labels: { skills: "UMIEJĘTNOŚCI" },
  },
});

// A compact, real editor record graph for the skills regression. The two
// flowGroup pairs are the same title/body structure used by generated
// subcategory sections, so the production RecordBlockAdd toolbar and the
// canvas-to-cv_data synchronization effect both participate in the E2E flow.
export const SAVED_ELEMENTS = Object.freeze([
  {
    element_id: "saved-name",
    category: "text",
    content: "Kamil Smoke",
    mastheadRole: "name",
    left: 250,
    top: 90,
    width: 280,
    height: 28,
    fontSize: 22,
    lineHeight: 26,
    page: 1,
    extra_properties: { mastheadRole: "name" },
  },
  {
    element_id: "skills-heading",
    category: "text",
    content: "UMIEJĘTNOŚCI",
    left: 250,
    top: 180,
    width: 280,
    height: 14,
    fontSize: 10,
    lineHeight: 12,
    page: 1,
    bold: true,
    flowRole: "section-chrome",
    extra_properties: {
      bold: true,
      lineHeight: 12,
      flowRole: "section-chrome",
    },
  },
  {
    element_id: "skills-rule",
    category: "line",
    left: 250,
    top: 198,
    width: 280,
    height: 1,
    page: 1,
    flowRole: "section-chrome",
    extra_properties: { flowRole: "section-chrome" },
  },
  {
    element_id: "skills-tools-title",
    category: "textarea",
    content: "Narzędzia",
    left: 250,
    top: 210,
    width: 280,
    height: 14,
    fontSize: 9,
    lineHeight: 12,
    page: 1,
    bold: true,
    autoHeight: true,
    flowRole: "content",
    flowGroup: "skills-tools",
    editorRecordLayout: "cc-sub",
    editorRecordField: "title",
    extra_properties: {
      bold: true,
      autoHeight: true,
      lineHeight: 12,
      flowRole: "content",
      flowGroup: "skills-tools",
      editorRecordLayout: "cc-sub",
      editorRecordField: "title",
    },
  },
  {
    element_id: "skills-tools-body",
    category: "textarea",
    content: "Figma  ·  Miro",
    left: 250,
    top: 226,
    width: 280,
    height: 14,
    fontSize: 9,
    lineHeight: 12,
    page: 1,
    autoHeight: true,
    flowRole: "content",
    flowGroup: "skills-tools",
    editorRecordLayout: "cc-sub",
    editorRecordField: "body",
    extra_properties: {
      autoHeight: true,
      lineHeight: 12,
      flowRole: "content",
      flowGroup: "skills-tools",
      editorRecordLayout: "cc-sub",
      editorRecordField: "body",
    },
  },
  {
    element_id: "skills-technologies-title",
    category: "textarea",
    content: "Technologie",
    left: 250,
    top: 254,
    width: 280,
    height: 14,
    fontSize: 9,
    lineHeight: 12,
    page: 1,
    bold: true,
    autoHeight: true,
    flowRole: "content",
    flowGroup: "skills-technologies",
    editorRecordLayout: "cc-sub",
    editorRecordField: "title",
    extra_properties: {
      bold: true,
      autoHeight: true,
      lineHeight: 12,
      flowRole: "content",
      flowGroup: "skills-technologies",
      editorRecordLayout: "cc-sub",
      editorRecordField: "title",
    },
  },
  {
    element_id: "skills-technologies-body",
    category: "textarea",
    content: "React  ·  TypeScript",
    left: 250,
    top: 270,
    width: 280,
    height: 14,
    fontSize: 9,
    lineHeight: 12,
    page: 1,
    autoHeight: true,
    flowRole: "content",
    flowGroup: "skills-technologies",
    editorRecordLayout: "cc-sub",
    editorRecordField: "body",
    extra_properties: {
      autoHeight: true,
      lineHeight: 12,
      flowRole: "content",
      flowGroup: "skills-technologies",
      editorRecordLayout: "cc-sub",
      editorRecordField: "body",
    },
  },
]);

const PRO_ENTITLEMENTS = Object.freeze({
  plan_slug: "pro",
  plan_name: "Pro",
  template_tier: "all",
  allowed_template_ids: null,
  ai_assistant: true,
  scoped_ai: true,
  features: { ai_assistant: true },
  limits: {
    max_projects: null,
    max_exports_per_month: null,
    max_ai_actions_per_month: 200,
    max_cv_imports_per_month: null,
    monthly_ai_credits: 200,
  },
  usage: {
    projects: 1,
    exports_count: 0,
    cv_imports_count: 0,
    ai_credits_used: 0,
    ai_credits_reserved: 0,
  },
  remaining: {
    projects: null,
    exports: null,
    cv_imports: null,
    ai_credits: 200,
  },
});

export const IMPORT_HISTORY = Object.freeze([
  {
    id: 136,
    filename: "CV-Kamil-Frontend-2026.pdf",
    created_at: "2026-09-01T16:28:13.000000",
    status: "succeeded",
    size_bytes: 191_488,
    document_count: 0,
    error_code: null,
  },
  {
    id: 135,
    filename: "CV-Kamil-starsze.pdf",
    created_at: "2026-08-31T09:23:42.000000",
    status: "failed",
    size_bytes: 859_136,
    document_count: 0,
    error_code: "extract_provider_timeout",
  },
]);

function json(route, value, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

/**
 * Install a complete same-origin API double before the first page navigation.
 *
 * The fallback deliberately returns an error and records the route instead of
 * proxying it. A missing fixture therefore fails visibly without contacting a
 * local or production backend. Deployed Render origins are separately aborted
 * and asserted at the end of each smoke flow.
 */
export async function installMockApi(
  page,
  {
    documents = [SAVED_DOCUMENT],
    savedDocument = SAVED_DOCUMENT,
    savedElements = SAVED_ELEMENTS,
    imports = IMPORT_HISTORY,
    assistantResponses = [],
    entitlements = PRO_ENTITLEMENTS,
  } = {},
) {
  const calls = [];
  const unexpected = [];
  const productionRequests = [];
  let currentRevision = savedDocument.revision;
  let currentImports = imports.map((item) => ({ ...item }));
  let assistantResponseIndex = 0;

  await page.route("https://**/*", async (route) => {
    const url = route.request().url();
    if (/onrender\.com|pdf-generator-react/i.test(url)) productionRequests.push(url);
    await route.abort("blockedbyclient");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();
    const call = {
      method,
      path,
      headers: request.headers(),
      body: request.postData(),
    };
    calls.push(call);

    if (method === "GET" && path === "/health") return json(route, { status: "ok" });
    if (method === "POST" && path === "/auth/token") {
      return json(route, { access_token: "local-playwright-token", token_type: "bearer" });
    }
    if (method === "GET" && path === "/auth/verify-token") {
      return json(route, { valid: true, username: "Kamil" });
    }
    if (method === "GET" && path === "/auth/me/entitlements") {
      return json(route, { ...PRO_ENTITLEMENTS, ...entitlements });
    }
    if (method === "GET" && path === "/pdf/fetch_pdfs") return json(route, documents);
    if (method === "POST" && path === "/pdf/show_pdf") {
      return json(route, { document: savedDocument, elements: savedElements });
    }
    if (method === "PUT" && path === "/pdf/update_pdf") {
      currentRevision += 1;
      return json(route, { updated: true, pdf_id: savedDocument.id, revision: currentRevision });
    }
    if (method === "POST" && path === "/pdf/create_pdf") {
      return json(route, { created: true, replayed: false, pdf_id: 91, revision: 1 });
    }
    if (method === "POST" && path === "/pdf/render_pdf") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''CV%20Smoke.pdf",
        },
        body: "%PDF-1.4\n% local Playwright fixture\n%%EOF",
      });
    }
    if (method === "POST" && path === "/pdf/download_pdf") {
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''CV%20Smoke.pdf",
        },
        body: "%PDF-1.4\n% local Playwright fixture\n%%EOF",
      });
    }
    if (method === "GET" && path === "/images/fetch_images") return json(route, []);
    if (method === "POST" && path === "/events/log") return json(route, { logged: true });
    if (method === "GET" && path === "/billing/plans") return json(route, { plans: [] });
    if (method === "GET" && path === "/ai/bio_cv_draft") return json(route, { draft: null });
    if (method === "POST" && path === "/ai/fill_template") {
      const payload = request.postDataJSON();
      return json(route, {
        elements: [
          {
            id: "starter-name",
            category: "text",
            content: payload.cv_data.name,
            mastheadRole: "name",
            left: 72,
            top: 72,
            width: 320,
            height: 34,
            fontSize: 24,
            lineHeight: 30,
            page: 1,
          },
          {
            id: "starter-summary",
            category: "textarea",
            content: payload.cv_data.summary,
            left: 72,
            top: 160,
            width: 450,
            height: 40,
            fontSize: 9,
            lineHeight: 13,
            page: 1,
          },
          {
            id: "starter-contact-anchor",
            category: "text",
            content: "",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            fontSize: 1,
            fontFamily: "Inter",
            color: "#000000",
            zIndex: 0,
            page: 1,
            flowRole: "masthead-anchor",
            contactBandId: "meridian-contact",
            contactBand: {
              id: "meridian-contact",
              mode: "centered",
              anchor: { centerX: 297.5, startY: 117, maxWidth: 471 },
              text: { fontFamily: "Montserrat", fontSizePt: 8, colorHex: "#657287" },
              icon: { sizePt: 10, theme: "meridian" },
              metrics: { iconGap: 11, itemPad: 16, lineStep: 13.5, charWidth: 5 },
              order: ["phone", "email", "location"],
            },
          },
          {
            id: "starter-email",
            category: "text",
            content: payload.cv_data.email,
            fontSize: 8,
            fontFamily: "Montserrat",
            color: "#657287",
            left: 187,
            top: 117,
            zIndex: 3,
            page: 1,
            flowRole: "masthead",
            contactChannel: "email",
            contactBandId: "meridian-contact",
          },
        ],
      });
    }
    if (method === "GET" && path === "/ai/imports") {
      return json(route, { items: currentImports, next_cursor: null });
    }
    if (method === "POST" && path === "/ai/assistant") {
      const response = assistantResponses[
        Math.min(assistantResponseIndex, Math.max(0, assistantResponses.length - 1))
      ];
      assistantResponseIndex += 1;
      return json(route, response || {
        message: "Lokalna odpowiedź asystenta.",
        tips: [],
        corrections: [],
      });
    }
    if (method === "DELETE" && /^\/ai\/imports\/\d+$/.test(path)) {
      const snapshotId = Number(path.split("/").at(-1));
      currentImports = currentImports.filter((item) => item.id !== snapshotId);
      return json(route, { deleted: true });
    }

    unexpected.push(`${method} ${path}`);
    return json(route, {
      detail: { code: "unmocked_e2e_route", message: "Brak lokalnej odpowiedzi testowej." },
    }, 501);
  });

  return {
    calls,
    unexpected,
    productionRequests,
    assertHermetic() {
      expect(unexpected, "Every API call must have an explicit local fixture").toEqual([]);
      expect(productionRequests, "E2E must never contact the deployed API").toEqual([]);
    },
  };
}

export async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Nazwa użytkownika").fill("Kamil");
  await page.getByLabel("Hasło").fill("local-test-password");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/cvstudio\/Kamil/);
  await expect(page.getByRole("heading", { name: "Jak chcesz zacząć?" })).toBeVisible();
}
