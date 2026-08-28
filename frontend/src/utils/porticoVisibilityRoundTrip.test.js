import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { porticoTemplate } from "../templates/portico.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { reflowPorticoAfterMastheadChange } from "./porticoMastheadReflow.js";
import {
  hideProfilePhoto,
  isProfilePhotoHidden,
  showProfilePhoto,
} from "./profilePhotoVisibility.js";
import { listDocumentSections, sectionElementIds } from "./sectionStructure.js";

const PAGE_HEIGHT = 842;

function withIds(elements) {
  return elements.map((element, index) => ({
    ...element,
    element_id: element.element_id || `element-${index}`,
  }));
}

function positionBand(element, members, page, startTop) {
  const firstTop = Math.min(...members.map((member) => Number(member.top)));
  return {
    ...element,
    page,
    top: startTop + Number(element.top) - firstTop,
  };
}

/**
 * Build the reported two-page boundary: the final Experience record is still
 * complete on page one, while Education and the remaining sections start on
 * page two. Hiding both masthead controls temporarily pulls those continuation
 * sections onto page one, which is the state that exposed stale photo homes on
 * restore.
 */
function completeExperienceBeforeEducationFixture() {
  const source = withIds(porticoTemplate);
  const sections = listDocumentSections(source);
  const education = sections.find((section) => section.title === "WYKSZTAŁCENIE");
  const skills = sections.find((section) => section.title === "UMIEJĘTNOŚCI");
  const languages = sections.find((section) => section.title === "JĘZYKI");
  const experienceTitle = source.find(
    (element) => element.content === "Specjalistka Obsługi Klienta",
  );
  const experienceMembers = source.filter(
    (element) => element.flowGroup === experienceTitle.flowGroup,
  );
  const sectionMembers = (section) => {
    const ids = sectionElementIds(source, section.headingId);
    return source.filter((element) => ids.has(element.element_id));
  };
  const educationMembers = sectionMembers(education);
  const skillsMembers = sectionMembers(skills);
  const languageMembers = sectionMembers(languages);

  return source.map((element) => {
    if (experienceMembers.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, experienceMembers, 1, 680);
    }
    if (educationMembers.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, educationMembers, 2, 66);
    }
    if (skillsMembers.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, skillsMembers, 2, 170);
    }
    if (languageMembers.some((member) => member.element_id === element.element_id)) {
      return positionBand(element, languageMembers, 2, 230);
    }
    return element;
  });
}

function absoluteTop(element) {
  return ((element.page || 1) - 1) * PAGE_HEIGHT + Number(element.top);
}

describe("Portico photo and job-title round trip", () => {
  for (const hideOrder of ["photo-first", "title-first"]) {
    for (const showOrder of ["photo-first", "title-first"]) {
      it(`preserves section order for ${hideOrder} hide and ${showOrder} show`, () => {
        let nextId = 0;
        const createId = () => `generated-${nextId += 1}`;
        let elements = completeExperienceBeforeEducationFixture();
        const reflow = () => {
          elements = reflowPorticoAfterMastheadChange(
            elements,
            DEFAULT_FLOW_SPACING,
            createId,
          );
        };
        const toggleTitle = () => {
          elements = applyTitleToggle(elements, "masthead-main", createId).elements;
          reflow();
        };
        const togglePhoto = (visible) => {
          elements = (visible ? showProfilePhoto : hideProfilePhoto)(
            elements,
            "portico",
          ).elements;
          reflow();
        };

        if (hideOrder === "photo-first") {
          togglePhoto(false);
          toggleTitle();
        } else {
          toggleTitle();
          togglePhoto(false);
        }
        if (showOrder === "photo-first") {
          togglePhoto(true);
          toggleTitle();
        } else {
          toggleTitle();
          togglePhoto(true);
        }

        const title = elements.find((element) => element.mastheadRole === "title");
        const identity = elements.find((element) => element.mastheadIdentity)?.mastheadIdentity;
        const summaryHeading = elements.find(
          (element) => element.content === "PODSUMOWANIE ZAWODOWE",
        );
        const experienceTitle = elements.find(
          (element) => element.content === "Specjalistka Obsługi Klienta",
        );
        const educationHeading = elements.find(
          (element) => element.content === "WYKSZTAŁCENIE",
        );
        const recordMembers = elements.filter(
          (element) => element.flowGroup === experienceTitle.flowGroup,
        );
        const recordBottom = Math.max(...recordMembers.map(
          (element) => absoluteTop(element) + Number(element.height || element.lineHeight || 12),
        ));

        assert.equal(isProfilePhotoHidden(elements), false);
        assert.equal(title.top, 169);
        assert.equal(identity.title.present, true);
        assert.equal(summaryHeading.top, 259);
        assert.ok(
          recordBottom < absoluteTop(educationHeading),
          "the final Experience record must finish before Education starts",
        );
      });
    }
  }
});
