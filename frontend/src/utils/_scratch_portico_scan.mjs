import { porticoTemplate } from "../templates/portico.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { reflowPorticoAfterMastheadChange } from "./porticoMastheadReflow.js";
import { hideProfilePhoto, showProfilePhoto } from "./profilePhotoVisibility.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";

const PAGE_HEIGHT = 842;
const abs = (element) => ((element.page || 1) - 1) * PAGE_HEIGHT + Number(element.top);
const withIds = (elements) => elements.map((element, index) => ({
  ...element,
  element_id: element.element_id || `element-${index}`,
}));
const positionBand = (element, members, page, startTop) => {
  const firstTop = Math.min(...members.map((member) => Number(member.top)));
  return { ...element, page, top: startTop + Number(element.top) - firstTop };
};

for (let experienceTop = 560; experienceTop <= 740; experienceTop += 10) {
  for (let educationTop = 50; educationTop <= 180; educationTop += 10) {
    const source = withIds(porticoTemplate);
    const sections = listDocumentSections(source);
    const experienceTitle = source.find((element) => element.content === "Specjalistka Obsługi Klienta");
    const experienceMembers = source.filter((element) => element.flowGroup === experienceTitle.flowGroup);
    const bands = new Map();
    for (const section of sections) {
      const ids = sectionElementIds(source, section.headingId);
      bands.set(section.title, source.filter((element) => ids.has(element.element_id)));
    }
    let elements = source.map((element) => {
      if (experienceMembers.some((member) => member.element_id === element.element_id)) {
        const moved = positionBand(element, experienceMembers, 1, experienceTop);
        return element === experienceMembers[experienceMembers.length - 1]
          ? { ...moved, height: 80 }
          : moved;
      }
      const education = bands.get("WYKSZTAŁCENIE");
      if (education.some((member) => member.element_id === element.element_id)) {
        return positionBand(element, education, 2, educationTop);
      }
      const skills = bands.get("UMIEJĘTNOŚCI");
      if (skills.some((member) => member.element_id === element.element_id)) {
        return positionBand(element, skills, 2, educationTop + 150);
      }
      const languages = bands.get("JĘZYKI");
      if (languages.some((member) => member.element_id === element.element_id)) {
        return positionBand(element, languages, 2, educationTop + 230);
      }
      return element;
    });
    const expected = listDocumentSections(elements).map((section) => ({
      ...section,
      ids: sectionElementIds(elements, section.headingId),
    }));
    let id = 0;
    const createId = () => `id-${id += 1}`;
    const oldReflow = () => {
      elements = reflowPorticoAfterMastheadChange(elements, DEFAULT_FLOW_SPACING, createId);
    };
    elements = hideProfilePhoto(elements, "portico").elements;
    oldReflow();
    elements = applyTitleToggle(elements, "masthead-main", createId).elements;
    oldReflow();
    elements = showProfilePhoto(elements, "portico").elements;
    oldReflow();
    elements = applyTitleToggle(elements, "masthead-main", createId).elements;
    oldReflow();
    const broken = expected.some((section) => {
      const heading = elements.find((element) => element.element_id === section.headingId);
      return elements.some((element) => (
        section.ids.has(element.element_id)
        && element.flowRole !== "section-chrome"
        && abs(element) <= abs(heading)
      ));
    });
    if (broken) {
      console.log(JSON.stringify({ experienceTop, educationTop }));
      process.exit(0);
    }
  }
}
console.log("no failure");
