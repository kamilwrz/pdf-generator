import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("welcomes the user with the recruitment outcome and no supporting subheading", () => {
    assert.match(source, /<span>Nowe CV<\/span>/);
    assert.match(source, /<em>Nowa praca<\/em>/);
    assert.doesNotMatch(source, /Nowe CV\.|Nowa praca\./);
    assert.doesNotMatch(source, /Stwórz CV,|które prowadzi|do rozmowy\./);
    assert.doesNotMatch(source, /Wgraj stare CV lub zacznij od zera/);
    assert.doesNotMatch(source, /profesjonalny dokument gotowy do/);
    assert.doesNotMatch(source, /heroLead/);
    assert.match(source, /CV Studio w praktyce/);
    assert.match(source, /Jedno CV\./);
    assert.match(source, /Wiele wersji\./);
    assert.match(source, /Bez pisania od nowa\./);
    assert.match(source, /Gotowe CV za 0 zł/);
  });

  it("uses equal-height accent fields in the wide lockup and compact stack", () => {
    assert.match(
      source,
      /<h1>\s*<span>Nowe CV<\/span>\s*<em>Nowa praca<\/em>\s*<\/h1>/s,
    );
    assert.match(styles, /\.hero h1\s*\{[^}]*display:\s*grid;[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch;/s);
    assert.match(styles, /\.hero h1 > span,[\s\S]*?\.hero h1 > em\s*\{[^}]*align-self:\s*stretch;[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /\.hero h1 em\s*\{[^}]*display:\s*block;[^}]*line-height:\s*1;/s);
    assert.match(styles, /\.hero h1\s*\{[^}]*justify-items:\s*start;[^}]*gap:\s*var\(--space-2\);[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;[^}]*font-size:\s*clamp\(2\.5rem,\s*6vw,\s*5\.5rem\);[^}]*text-align:\s*left;/s);
    assert.match(styles, /\.hero h1 > span\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-self:\s*end;[^}]*margin-right:\s*var\(--space-4\);[^}]*background:\s*var\(--taupe\);[^}]*color:\s*var\(--paper\);[^}]*font-size:\s*clamp\(2rem,\s*4vw,\s*3\.5rem\);/s);
    assert.match(styles, /\.hero h1 em,[\s\S]*?background:\s*var\(--ink\);[^}]*box-shadow:\s*inset 0 -\.16em 0 var\(--taupe\);/s);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.hero h1\s*\{[^}]*grid-template-columns:\s*max-content max-content;[^}]*grid-template-rows:\s*1fr;[^}]*gap:\s*var\(--space-4\);/s);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.hero h1 > span\s*\{[^}]*justify-self:\s*start;[^}]*margin-right:\s*0;/s);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.hero h1\s*\{[^}]*font-size:\s*clamp\(2\.5rem,\s*12vw,\s*3\.5rem\);/s);
    assert.match(styles, /\.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 960px\);[^}]*place-content:\s*center;/s);
    assert.match(styles, /\.heroCopy\s*\{[^}]*max-width:\s*960px;[^}]*text-align:\s*center;/s);
    assert.match(styles, /\.heroActions\s*\{[^}]*justify-content:\s*center;/s);
  });

  it("uses concise action and benefit labels in section 01", () => {
    const heroStart = source.indexOf('<section id="top"');
    const heroEnd = source.indexOf("</section>", heroStart);
    const heroMarkup = source.slice(heroStart, heroEnd);

    assert.ok(heroStart >= 0 && heroEnd > heroStart);
    assert.match(heroMarkup, /CV GOTOWE NA REKRUTACJE/);
    assert.match(heroMarkup, /event="hero_wizard">Kreator CV<\/CtaLink>/);
    assert.match(heroMarkup, /event="hero_import" variant="secondary">\s*Import CV/s);
    assert.match(heroMarkup, /aria-label="Zobacz przykładowe CV — demo"/);
    assert.match(heroMarkup, />\s*DEMO <ArrowIcon \/>/s);
    assert.match(heroMarkup, /<li>100% ZA DARMO<\/li>/);
    assert.match(heroMarkup, /<li>POMOC AI<\/li>/);
    assert.match(heroMarkup, /<li>INTELIGENTNY LAYOUT<\/li>/);
    assert.doesNotMatch(
      heroMarkup,
      /Stwórz CV za darmo|Wgraj swoje CV|Najpierw zobacz przykładowe CV|CZYSTY PDF/,
    );
  });

  it("presents section 02 as three concrete capabilities before the template gallery", () => {
    const capabilities = [
      "Dopasuj treść do oferty",
      "Edytuj bezpośrednio na stronie A4",
      "Zmień szablon bez przepisywania",
    ];
    const offerStart = source.indexOf('<ul className={classes.offerSteps}');
    const offerEnd = source.indexOf("</ul>", offerStart);
    const galleryStart = source.indexOf('<div className={classes.templateGalleryHeader}>');
    const offerMarkup = source.slice(offerStart, offerEnd);
    const statementStart = source.indexOf('<div className={classes.offerStatement}>');
    const statementEnd = source.indexOf("</div>", statementStart);
    const statementMarkup = source.slice(statementStart, statementEnd);

    assert.ok(offerStart >= 0 && offerEnd > offerStart);
    assert.ok(galleryStart > offerEnd);
    assert.equal((offerMarkup.match(/<li>/g) || []).length, 3);
    assert.match(offerMarkup, /Najważniejsze funkcje CV Studio/);
    for (let index = 1; index < capabilities.length; index += 1) {
      assert.ok(
        offerMarkup.indexOf(capabilities[index - 1]) < offerMarkup.indexOf(capabilities[index]),
      );
    }
    assert.doesNotMatch(statementMarkup, /<em>|<u>/);

    assert.match(source, /Ta sama treść\. Inny charakter\./);
    assert.match(source, /Stwórz CV w wybranym szablonie/);
    assert.match(styles, /\.templatesSection\s*\{[^}]*background:\s*var\(--paper\);/s);
    assert.match(styles, /\.offerIntro\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s);
    assert.match(styles, /\.offerStatement h2\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:/s);
    assert.match(styles, /\.offerStatement h2 > span\s*\{[^}]*display:\s*block;[^}]*line-height:\s*1\.04;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*?\.offerIntro\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it("keeps the retained template, privacy, pricing, and FAQ caveats", () => {
    assert.match(source, /Twoje dokumenty nie są publiczne/);
    assert.match(source, /Zmień szablon bez przepisywania/);
    assert.match(source, /Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym/);
  });

  it("renders only sections 01, 02, 09, 10, and 11 before the footer", () => {
    assert.deepEqual(
      [...source.matchAll(/<section\b[\s\S]*?data-section-index="(\d{2})"[\s\S]*?<\/section>/g)]
        .map((match) => match[1]),
      ["01", "02", "09", "10", "11"],
    );
    assert.equal((source.match(/<section\b/g) || []).length, 5);
    assert.equal((source.match(/<footer\b/g) || []).length, 1);
    assert.doesNotMatch(source, /before_after_import|id="jak-to-dziala"|final_wizard|final_import/);
  });

  it("preserves retained directed starts, analytics events, anchors, and dynamic template count", () => {
    for (const event of [
      "hero_wizard",
      "hero_import",
      "templates_wizard",
      "pricing_free",
      "pricing_pro",
    ]) {
      assert.match(source, new RegExp(`event=\\"${event}\\"|queueGuestEvent\\(\\"${event}\\"\\)`));
    }

    assert.match(source, /buildStartUrl\("wizard", "free"\)/);
    assert.match(source, /buildStartUrl\("import", "free"\)/);
    assert.match(source, /\{TEMPLATE_COUNT\}/);
    assert.match(source, /id="szablony"/);
    assert.match(source, /id="privacy"/);
    assert.match(source, /id="cennik"/);
  });

  it("renders one centered hero with a subdued editorial background image", () => {
    assert.match(source, /women-job-call\.png/);
    assert.match(styles, /\.heroMedia::after\s*\{[^}]*background:\s*var\(--paper\);[^}]*opacity:\s*\.82;/s);
    assert.doesNotMatch(source, /HERO_SHOWCASE|isHeroShowcasePaused|Wgraj stare CV\.|szablonu premium/);
    assert.doesNotMatch(styles, /heroVisual|heroSequence|heroMotionToggle|heroDocument|heroChip|heroTemplateCycle|heroSequenceProgress/);
    assert.doesNotMatch(styles, /\.hero::before|\.hero::after/);
  });
});
