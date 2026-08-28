import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { porticoTemplate } from "../templates/portico.js";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { applyTitleToggle } from "./mastheadIdentityOps.js";
import { reflowPorticoAfterMastheadChange } from "./porticoMastheadReflow.js";
import { reflowTextareaHeight } from "./textareaReflow.js";
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

function sectionMembershipSnapshot(elements) {
  return listDocumentSections(elements).map((section) => ({
    ...section,
    memberIds: sectionElementIds(elements, section.headingId),
  }));
}

function assertSectionContentFollowsItsHeading(elements, sections) {
  for (const section of sections) {
    const heading = elements.find(
      (element) => element.element_id === section.headingId,
    );
    const bodyMembers = elements.filter((element) => (
      section.memberIds.has(element.element_id)
      && element.element_id !== section.headingId
      && element.flowRole !== "section-chrome"
    ));
    assert.ok(
      bodyMembers.every((element) => absoluteTop(element) > absoluteTop(heading)),
      `${section.title} content must remain below its heading`,
    );
  }
}

describe("Portico photo and job-title round trip", () => {
  for (const hideOrder of ["photo-first", "title-first"]) {
    for (const showOrder of ["photo-first", "title-first"]) {
      it(`preserves section order for ${hideOrder} hide and ${showOrder} show`, () => {
        let nextId = 0;
        const createId = () => `generated-${nextId += 1}`;
        let elements = completeExperienceBeforeEducationFixture();
        const expectedSections = sectionMembershipSnapshot(elements);
        const reflow = (membershipReference) => {
          elements = reflowPorticoAfterMastheadChange(
            elements,
            DEFAULT_FLOW_SPACING,
            createId,
            membershipReference,
          );
        };
        const toggleTitle = () => {
          const membershipReference = elements;
          elements = applyTitleToggle(elements, "masthead-main", createId).elements;
          reflow(membershipReference);
        };
        const togglePhoto = (visible) => {
          const membershipReference = elements;
          elements = (visible ? showProfilePhoto : hideProfilePhoto)(
            elements,
            "portico",
          ).elements;
          reflow(membershipReference);
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
        const sections = listDocumentSections(elements);
        const sectionTitles = sections.map((section) => section.title);

        assert.equal(isProfilePhotoHidden(elements), false);
        assert.equal(title.top, 169);
        assert.equal(identity.title.present, true);
        assert.equal(summaryHeading.top, 259);
        assert.deepEqual(sectionTitles, [
          "PODSUMOWANIE ZAWODOWE",
          "DOŚWIADCZENIE ZAWODOWE",
          "WYKSZTAŁCENIE",
          "UMIEJĘTNOŚCI",
          "JĘZYKI",
        ]);
        assert.ok(
          recordBottom < absoluteTop(educationHeading),
          "the final Experience record must finish before Education starts",
        );
        assertSectionContentFollowsItsHeading(elements, expectedSections);
      });
    }
  }

  it("uses pre-toggle ownership when continuation content crosses its heading", () => {
    const reference = completeExperienceBeforeEducationFixture();
    const expectedSections = sectionMembershipSnapshot(reference);
    const education = expectedSections.find((section) => section.title === "WYKSZTAŁCENIE");
    const skills = expectedSections.find((section) => section.title === "UMIEJĘTNOŚCI");
    const educationBody = reference
      .filter((element) => (
        education.memberIds.has(element.element_id)
        && element.flowRole !== "section-chrome"
      ))
      .sort((left, right) => absoluteTop(left) - absoluteTop(right));
    const skillsBody = reference.find((element) => (
      skills.memberIds.has(element.element_id)
      && element.flowRole !== "section-chrome"
    ));

    // Reproduce the transient geometry visible in the report: the first degree
    // sits at the end of Experience and the Skills body precedes its heading.
    // IDs and semantic ownership are still unchanged from `reference`.
    const crossed = reference.map((element) => {
      if (element.element_id === educationBody[0].element_id) {
        return { ...element, page: 1, top: 748 };
      }
      if (element.element_id === skillsBody.element_id) {
        return { ...element, page: 2, top: 150 };
      }
      return element;
    });
    let nextId = 0;
    const packed = reflowPorticoAfterMastheadChange(
      crossed,
      DEFAULT_FLOW_SPACING,
      () => `repair-${nextId += 1}`,
      reference,
    );

    assertSectionContentFollowsItsHeading(packed, expectedSections);
    assert.deepEqual(
      listDocumentSections(packed).map((section) => section.title),
      expectedSections.map((section) => section.title),
    );
  });

  it("keeps section ownership while remounted continuation textareas settle", () => {
    let elements = completeExperienceBeforeEducationFixture();
    const expectedSections = sectionMembershipSnapshot(elements);
    let nextId = 0;
    const createId = () => `settle-${nextId += 1}`;
    const togglePhoto = (visible) => {
      const reference = elements;
      elements = (visible ? showProfilePhoto : hideProfilePhoto)(
        elements,
        "portico",
      ).elements;
      elements = reflowPorticoAfterMastheadChange(
        elements,
        DEFAULT_FLOW_SPACING,
        createId,
        reference,
      );
    };

    togglePhoto(false);
    togglePhoto(true);
    const textareaIds = elements
      .filter((element) => element.category === "textarea" && element.autoHeight)
      .map((element) => element.element_id);
    for (const elementId of textareaIds) {
      const current = elements.find((element) => element.element_id === elementId);
      const settled = reflowTextareaHeight(
        elements,
        elementId,
        Number(current.height),
        PAGE_HEIGHT,
        {
          pageTop: 66,
          bottomMargin: 72,
          allowReclaim: true,
          spacing: DEFAULT_FLOW_SPACING,
        },
      );
      elements = settled.elements;
    }

    assertSectionContentFollowsItsHeading(elements, expectedSections);
  });
});
