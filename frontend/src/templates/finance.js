// Finance CV — classic single column. Times-Roman headings + Inter body.
// Decoration: full-width header rule + short gold accent bars under headings.
import { text, line, block, bulleted } from "./helpers";

const INK = "#16243A";
const SUB = "#5A6B7B";
const BODY = "#2B2B2B";
const GOLD = "#B08D57";
const GRAY = "#6B7280";

export const financeTemplate = [
    text("ANNA KOWALSKA", 30, "Times-Roman", INK, 50, 54),
    text("Główny Analityk Finansowy", 14, "Times-Roman", SUB, 50, 92),
    text("anna.kowalska@email.com   ·   +48 600 123 456   ·   Warszawa", 9.5, "Inter", SUB, 50, 118),
    line(50, 138, 495, 1.5, INK),

    text("PROFIL", 12, "Times-Roman", INK, 50, 154),
    line(50, 170, 70, 2, GOLD),
    block("Analityk finansowy z 8-letnim doświadczeniem w wycenie, zarządzaniu portfelem i finansach korporacyjnych. Udokumentowane sukcesy w budowaniu modeli wspierających decyzje o wartości wielu milionów złotych i prezentowaniu ich kadrze zarządzającej.", 50, 180, 495, 58, 10.5, 15),

    text("DOŚWIADCZENIE", 12, "Times-Roman", INK, 50, 252),
    line(50, 268, 70, 2, GOLD),
    text("Główny Analityk Finansowy", 11, "Inter", INK, 50, 282),
    text("PKO BP Capital   ·   Warszawa   ·   2019 – obecnie", 9.5, "Inter", GRAY, 50, 298),
    bulleted(block("• Opracował modele DCF i LBO wspierające transakcje o wartości 250 mln zł.\n• Zarządzał portfelem wieloaktywowym o wartości 250 mln zł, przewyższając benchmark o 4%.\n• Prezentował kwartalne wyniki kierownictwu i klientom.", 50, 314, 495, 52, 10, 14)),
    text("Analityk Finansowy", 11, "Inter", INK, 50, 378),
    text("Meridian Doradztwo   ·   2016 – 2019", 9.5, "Inter", GRAY, 50, 394),
    bulleted(block("• Zautomatyzował miesięczne raportowanie, skracając czas zamknięcia o 30%.\n• Wspierał due diligence przy 12 transakcjach M&A.", 50, 410, 495, 38, 10, 14)),

    text("EDUKACJA", 12, "Times-Roman", INK, 50, 462),
    line(50, 478, 70, 2, GOLD),
    text("Licencjat Finanse — Uniwersytet Warszawski", 11, "Inter", INK, 50, 492),
    text("2012 – 2016   ·   Wydział Nauk Ekonomicznych", 9.5, "Inter", GRAY, 50, 508),

    text("UMIEJĘTNOŚCI I CERTYFIKATY", 12, "Times-Roman", INK, 50, 552),
    line(50, 568, 70, 2, GOLD),
    block("Modelowanie finansowe · Wycena · Bloomberg Terminal · Excel / VBA · SQL · CFA Level II", 50, 578, 495, 40, 10, 15),
];
