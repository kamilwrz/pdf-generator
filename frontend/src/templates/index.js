import { t as uiText } from "../i18n/index.js";
import { localisedList } from "../i18n/index.js";
/**
 * Registry of built-in CV templates shown in pickers and Hero mockups.
 *
 * Each entry is an individual product template. `description` is the short
 * picker copy; `details` explains the real document structure on the public
 * detail route. `layouts` is code-only metadata so generators and reflow can
 * share sidebar / icons / dark behaviour without exposing implementation tags
 * to users. `tier` drives Free vs paid gating. Only Free starter packs are
 * shipped to the browser; Pro geometry is materialized by the entitlement-
 * gated backend generator after selection.
 */
import { sterlingTemplate } from "./sterling";
import { meridianTemplate } from "./meridian";
import { lindenTemplate } from "./linden";

export { TEMPLATE_LAYOUT_TAGS } from "../utils/templateLayouts";

export const TEMPLATES = [
    {
        id: "monument",
        tier: "paid",
        name: "Monument",
        get description() { return uiText("editor:index.aBlackAndWhiteLayoutWithNumbered"); },
        details: {
            get heading() { return uiText("editor:index.numberedSectionsInASingleColumn"); },
            get body() { return uiText("editor:index.monumentSeparatesCvSectionsWithNumbersFrames"); },
            highlights: localisedList([
                () => uiText("editor:index.numberedSectionsMakeTheDocumentEasyTo"),
                () => uiText("editor:index.aSingleColumnPreservesNaturalReadingOrder"),
                () => uiText("editor:index.anOptionalPhotoSitsInItsOwn"),
            ]),
        },
        layouts: ["single"],
        accent: "#343434",
        serverMaterialized: true,
    },
    {
        id: "slate",
        tier: "paid",
        name: "Slate",
        get description() { return uiText("editor:index.twoColumnsWithASeparatePanelFor"); },
        details: {
            get heading() { return uiText("editor:index.experienceInAWideColumn"); },
            get body() { return uiText("editor:index.slatePlacesSkillsLanguagesAndEducationIn"); },
            highlights: localisedList([
                () => uiText("editor:index.theSidebarOrganisesShortListsAndAdditional"),
                () => uiText("editor:index.theWideMainColumnAccommodatesDetailedExperience"),
                () => uiText("editor:index.theOptionalPhotoIsClearlySeparatedFrom"),
            ]),
        },
        layouts: ["sidebar", "icons"],
        accent: "#3E5C76",
        serverMaterialized: true,
    },
    {
        id: "atrium",
        tier: "paid",
        name: "Atrium",
        get description() { return uiText("editor:index.aLightSingleColumnLayoutWithGenerous"); },
        details: {
            get heading() { return uiText("editor:index.simpleReadingOrderAndMoreSpace"); },
            get body() { return uiText("editor:index.atriumUsesOneWideColumnAndThin"); },
            highlights: localisedList([
                () => uiText("editor:index.moreWhiteSpaceMakesAShorterCv"),
                "Jedna kolumna prowadzi rekrutera przez dokument krok po kroku.",
                () => uiText("editor:index.theOptionalPhotoRemainsADiscreetPart"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#556158",
        serverMaterialized: true,
    },
    {
        id: "sterling",
        tier: "free",
        name: "Sterling",
        get description() { return uiText("editor:index.twoColumnsASidebarForShorterInformation"); },
        details: {
            get heading() { return uiText("editor:index.moreSpaceForEmploymentHistory"); },
            get body() { return uiText("editor:index.sterlingPlacesTheSummarySkillsLanguagesAnd"); },
            highlights: localisedList([
                () => uiText("editor:index.aWideSidebarHoldsSeveralShorterSections"),
                () => uiText("editor:index.theMainColumnLeavesSpaceForResponsibilities"),
                () => uiText("editor:index.mutedAccentsSeparateSectionsWithoutDominatingThe"),
            ]),
        },
        layouts: ["sidebar"],
        accent: "#4A6FA5",
        elements: sterlingTemplate,
    },
    {
        id: "regent",
        tier: "paid",
        name: "Regent",
        get description() { return uiText("editor:index.aFormalBlackAndWhiteSingleColumn"); },
        details: {
            get heading() { return uiText("editor:index.aFormalCvAcrossTheFullPage"); },
            get body() { return uiText("editor:index.regentHasNoSidebarOrLargeGraphic"); },
            highlights: localisedList([
                () => uiText("editor:index.aSingleColumnMakesLongerDescriptionsEasier"),
                () => uiText("editor:index.blackAndWhiteSuitsAFormalDocument"),
                () => uiText("editor:index.datesAndLocationsStayCloseToThe"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#151515",
        serverMaterialized: true,
    },
    {
        id: "meridian",
        tier: "free",
        name: "Meridian",
        get description() { return uiText("editor:index.aSingleColumnWithDatesOnThe"); },
        details: {
            get heading() { return uiText("editor:index.careerHistoryOnOneAxis"); },
            get body() { return uiText("editor:index.meridianArrangesSectionsFromTopToBottom"); },
            highlights: localisedList([
                () => uiText("editor:index.fullPageWidthAccommodatesDetailedRoleDescriptions"),
                () => uiText("editor:index.datesOnTheRightMakeChronologyEasy"),
                () => uiText("editor:index.smallColourAccentsOrganiseTheDocument"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#3D5A80",
        elements: meridianTemplate,
    },
    {
        id: "linden",
        tier: "free",
        name: "Linden",
        get description() { return uiText("editor:index.twoColumnsWithRoomForAPhoto"); },
        details: {
            get heading() { return uiText("editor:index.photoAndShorterDetailsOnTheSide"); },
            get body() { return uiText("editor:index.lindenReservesTheMainColumnForSummary"); },
            highlights: localisedList([
                () => uiText("editor:index.theSidebarSeparatesShortDetailsFromLonger"),
                () => uiText("editor:index.theLargeOptionalPhotoAreaLeavesRoom"),
                () => uiText("editor:index.quietGreenAndAWarmBackgroundGive"),
            ]),
        },
        layouts: ["sidebar", "icons"],
        accent: "#285548",
        elements: lindenTemplate,
    },
    {
        id: "cadenza",
        tier: "paid",
        name: "Cadenza",
        get description() { return uiText("editor:index.aSingleColumnWithSectionBandsAnd"); },
        details: {
            get heading() { return uiText("editor:index.datesAndLocationsOnASharedAxis"); },
            get body() { return uiText("editor:index.cadenzaSeparatesSectionsWithHorizontalBandsAnd"); },
            highlights: localisedList([
                () => uiText("editor:index.sectionBandsClearlyDivideTheDocument"),
                () => uiText("editor:index.aRightHandAxisOrganisesDatesAnd"),
                () => uiText("editor:index.oneColumnComfortablyAccommodatesSuccessiveRoles"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#855C46",
        serverMaterialized: true,
    },
    {
        id: "vellum",
        tier: "paid",
        name: "Vellum",
        get description() { return uiText("editor:index.aSpaciousLayoutWithAPhotoWide"); },
        details: {
            get heading() { return uiText("editor:index.summaryAndSkillsCloseToTheHeader"); },
            get body() { return uiText("editor:index.vellumPlacesALargePhotoWideSummary"); },
            highlights: localisedList([
                () => uiText("editor:index.summaryAndSkillsAppearBeforeEmploymentHistory"),
                () => uiText("editor:index.datesAndLocationsFormAClearRight"),
                () => uiText("editor:index.anOptionalPhotoHasALargeSeparate"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#8A5E47",
        serverMaterialized: true,
    },
    {
        id: "aurelia",
        tier: "paid",
        name: "Aurelia",
        get description() { return uiText("editor:index.aSingleColumnLayoutWithAFramed"); },
        details: {
            get heading() { return uiText("editor:index.aFramedHeaderAndOneContentColumn"); },
            get body() { return uiText("editor:index.aureliaPlacesYourNameAndJobTitle"); },
            highlights: localisedList([
                () => uiText("editor:index.aFramedHeaderClearlyOpensTheDocument"),
                () => uiText("editor:index.aSingleColumnKeepsReadingOrderSimple"),
                () => uiText("editor:index.datesOnTheRightLeaveMoreRoom"),
            ]),
        },
        layouts: ["single", "icons"],
        accent: "#98884D",
        serverMaterialized: true,
    },
];
