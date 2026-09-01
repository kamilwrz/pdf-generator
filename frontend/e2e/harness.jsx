/* eslint-disable react-refresh/only-export-components -- Vite loads this browser-only E2E entry directly. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "../src/components/common/ErrorBoundary/ErrorBoundary.jsx";
import { syncCvDataFromCanvas } from "../src/utils/syncCvDataFromCanvas.js";

const heading = {
  element_id: "skills-heading",
  category: "text",
  content: "UMIEJĘTNOŚCI",
  flowRole: "section-chrome",
  top: 100,
  left: 60,
  page: 1,
};

const tools = [
  {
    element_id: "tools-category",
    category: "textarea",
    content: "Narzędzia",
    flowRole: "content",
    flowGroup: "tools",
  },
  {
    element_id: "tools-items",
    category: "textarea",
    content: "Figma, Miro",
    flowRole: "content",
    flowGroup: "tools",
  },
];

const technologies = [{
  element_id: "technologies-category",
  category: "textarea",
  content: "Technologie",
  flowRole: "content",
  flowGroup: "technologies",
  top: 130,
  left: 60,
  page: 1,
}];

const initialProfile = {
  name: "Kamil Smoke",
  title: "",
  summary: "",
  experience: [],
  skills: [
    { category: "Narzędzia", items: ["Figma", "Miro"] },
    { category: "Technologie", items: ["React", "TypeScript"] },
  ],
  labels: { skills: "UMIEJĘTNOŚCI" },
};

const tombstones = tools.map((element) => ({ ...element, deletedRecord: true }));

function restoredRecord() {
  const shared = {
    category: "textarea",
    flowRole: "content",
    flowGroup: "record-restored",
    editorAddedRecord: true,
    editorRecordLayout: "cc-sub",
    left: 60,
    page: 1,
  };
  return [
    {
      ...shared,
      element_id: "restored-category",
      content: "Narzędzia",
      editorRecordField: "title",
      top: 160,
    },
    {
      ...shared,
      element_id: "restored-items",
      content: "Figma, Miro",
      editorRecordField: "body",
      top: 175,
    },
  ];
}

/** Exercise the production synchronizer through the same retained tombstones as the editor. */
function SkillsRegressionHarness() {
  const [profile, setProfile] = useState(initialProfile);
  const [canvas, setCanvas] = useState([heading, ...tools, ...technologies]);
  const [deleted, setDeleted] = useState([]);

  // This mirrors the editor synchronization effect. The fixed implementation
  // returns the same object after convergence, while the historical bug kept
  // scheduling fresh state forever after a category was restored.
  useEffect(() => {
    const synchronized = syncCvDataFromCanvas(profile, canvas, canvas, deleted);
    // The harness intentionally mirrors the production synchronization effect:
    // reference equality is the regression contract that stops the next pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (synchronized !== profile) setProfile(synchronized);
  }, [canvas, deleted, profile]);

  function removeTools() {
    const remaining = [heading, ...technologies];
    setProfile(syncCvDataFromCanvas(profile, canvas, remaining, tombstones));
    setCanvas(remaining);
    setDeleted(tombstones);
  }

  function restoreTools() {
    const restoredCanvas = [...canvas, ...restoredRecord()];
    setProfile(syncCvDataFromCanvas(profile, canvas, restoredCanvas, deleted));
    setCanvas(restoredCanvas);
  }

  return (
    <section aria-labelledby="skills-regression-title">
      <h1 id="skills-regression-title">Regresja kategorii umiejętności</h1>
      <ul aria-label="Kategorie umiejętności">
        {profile.skills.map((skill) => <li key={skill.category}>{skill.category}</li>)}
      </ul>
      <button type="button" onClick={removeTools}>Usuń kategorię Narzędzia</button>
      <button type="button" onClick={restoreTools}>Dodaj kategorię Narzędzia ponownie</button>
    </section>
  );
}

function Crash({ enabled }) {
  if (enabled) throw new Error("sensitive-render-detail-must-stay-hidden");
  return <p>Edytor testowy działa</p>;
}

function ErrorBoundaryHarness() {
  const [crash, setCrash] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <section aria-labelledby="boundary-title">
      <h1 id="boundary-title">Error Boundary smoke</h1>
      <button type="button" onClick={() => setCrash(true)}>Wywołaj błąd renderowania</button>
      <button
        type="button"
        onClick={() => {
          setCrash(false);
          setResetKey((value) => value + 1);
        }}
      >
        Przywróć bezpieczny widok
      </button>
      <ErrorBoundary resetKey={resetKey} compact>
        <Crash enabled={crash} />
      </ErrorBoundary>
    </section>
  );
}

function Harness() {
  return (
    <BrowserRouter>
      <SkillsRegressionHarness />
      <ErrorBoundaryHarness />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")).render(<Harness />);
