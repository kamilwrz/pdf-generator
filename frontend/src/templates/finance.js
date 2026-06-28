// Finance CV — classic single column. Times-Roman headings + Inter body.
// Decoration: full-width header rule + short gold accent bars under headings.
import { text, line, block } from "./helpers";

const INK = "#16243A";
const SUB = "#5A6B7B";
const BODY = "#2B2B2B";
const GOLD = "#B08D57";
const GRAY = "#6B7280";

export const financeTemplate = [
    text("ALEXANDER MORGAN", 30, "Times-Roman", INK, 50, 54),
    text("Senior Financial Analyst", 14, "Times-Roman", SUB, 50, 92),
    text("alex.morgan@email.com   ·   +1 (555) 010-2030   ·   New York, NY", 9.5, "Inter", SUB, 50, 118),
    line(50, 138, 495, 1.5, INK),

    text("PROFESSIONAL SUMMARY", 12, "Times-Roman", INK, 50, 154),
    line(50, 170, 70, 2, GOLD),
    block("Results-driven financial analyst with 8+ years in valuation, portfolio management and corporate finance. Proven record of building models that drive multimillion-dollar decisions and presenting them to executive stakeholders.", 50, 180, 495, 58, 10.5, 15),

    text("PROFESSIONAL EXPERIENCE", 12, "Times-Roman", INK, 50, 252),
    line(50, 268, 70, 2, GOLD),
    text("Senior Financial Analyst", 11, "Inter", INK, 50, 282),
    text("Goldman Stanley Capital   ·   New York   ·   2019 – Present", 9.5, "Inter", GRAY, 50, 298),
    block("• Built DCF and LBO models supporting $250M in transactions.\n• Managed a $250M multi-asset portfolio, outperforming benchmark by 4%.\n• Presented quarterly results to executive leadership and clients.", 50, 314, 495, 52, 10, 14),
    text("Financial Analyst", 11, "Inter", INK, 50, 378),
    text("Meridian Advisors   ·   2016 – 2019", 9.5, "Inter", GRAY, 50, 394),
    block("• Automated monthly reporting, cutting close time by 30%.\n• Supported due diligence on 12 M&A deals.", 50, 410, 495, 38, 10, 14),

    text("EDUCATION", 12, "Times-Roman", INK, 50, 462),
    line(50, 478, 70, 2, GOLD),
    text("B.S. Finance — University of Pennsylvania", 11, "Inter", INK, 50, 492),
    text("2012 – 2016   ·   The Wharton School", 9.5, "Inter", GRAY, 50, 508),

    text("SKILLS & CERTIFICATIONS", 12, "Times-Roman", INK, 50, 552),
    line(50, 568, 70, 2, GOLD),
    block("Financial Modeling · Valuation · Bloomberg Terminal · Excel / VBA · SQL · CFA Level II", 50, 578, 495, 40, 10, 15),
];
