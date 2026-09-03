import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./Hero.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Hero.module.css", import.meta.url), "utf8");

describe("landing product positioning", () => {
  it("welcomes the user with one main heading and a supporting subheading", () => {
    assert.match(source, /<h1>Stwórz CV<\/h1>/);
    assert.match(source, /<p className=\{classes\.heroSubheading\}>Zwiększ swoje szanse<\/p>/);
    assert.doesNotMatch(source, /Stwórz CV\.|Zwiększ swoje szanse\./);
    assert.doesNotMatch(source, /Stwórz CV,|które prowadzi|do rozmowy\./);
    assert.doesNotMatch(source, /Wgraj stare CV lub zacznij od zera/);
    assert.doesNotMatch(source, /profesjonalny dokument gotowy do/);
    assert.doesNotMatch(source, /heroLead/);
    assert.match(source, /CV Studio w praktyce/);
    assert.match(source, /<span>Jedno CV<\/span>/);
    assert.match(source, /<span>Wiele mocnych wersji<\/span>/);
    assert.match(source, /<span>Bez wysiłku\.\.\.<\/span>/);
    assert.doesNotMatch(source, /Jedno CV\.|Wiele mocnych wersji\./);
    assert.doesNotMatch(source, /Wybierz układ odpowiedni dla siebie\./);
    assert.match(source, /Pro, gdy chcesz więcej\./);
    assert.doesNotMatch(source, /Pro, gdy potrzebujesz więcej wersji\./);
  });

  it("uses a centred two-level heading with the requested brand colours", () => {
    assert.match(
      source,
      /<div className=\{classes\.heroHeading\}>\s*<h1>Stwórz CV<\/h1>\s*<p className=\{classes\.heroSubheading\}>Zwiększ swoje szanse<\/p>\s*<\/div>/s,
    );
    assert.match(styles, /\.heroHeading\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;[^}]*gap:\s*var\(--space-3\);[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;[^}]*text-align:\s*center;/s);
    assert.match(styles, /\.hero h1\s*\{[^}]*color:\s*var\(--taupe\);[^}]*font-size:\s*clamp\(2\.5rem,\s*6vw,\s*5\.5rem\);[^}]*line-height:\s*\.94;/s);
    assert.match(styles, /\.heroSubheading\s*\{[^}]*max-width:\s*min\(100%,\s*28ch\);[^}]*background:\s*var\(--ink\);[^}]*color:\s*var\(--beige\);[^}]*font-size:\s*clamp\(1\.5rem,\s*2\.5vw,\s*2\.25rem\);[^}]*line-height:\s*1\.1;/s);
    assert.match(styles, /\.pricingHeading h2 em\s*\{[^}]*box-shadow:\s*inset 0 -\.16em 0 var\(--taupe\);/s);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.hero h1\s*\{[^}]*font-size:\s*clamp\(2\.5rem,\s*14vw,\s*4rem\);/s);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.heroSubheading\s*\{[^}]*width:\s*100%;/s);
    assert.match(styles, /\.hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1280px\);[^}]*place-content:\s*center;/s);
    assert.match(styles, /\.heroCopy\s*\{[^}]*max-width:\s*1280px;[^}]*text-align:\s*center;/s);
    assert.match(styles, /\.heroActions\s*\{[^}]*justify-content:\s*center;/s);
  });

  it("uses concise action and benefit labels in section 01", () => {
    const heroStart = source.indexOf('<section id="top"');
    const heroEnd = source.indexOf("</section>", heroStart);
    const heroMarkup = source.slice(heroStart, heroEnd);

    assert.ok(heroStart >= 0 && heroEnd > heroStart);
    assert.match(heroMarkup, /CV GOTOWE NA REKRUTACJE/);
    assert.match(heroMarkup, /event="hero_new_cv">Utwórz nowe CV<\/CtaLink>/);
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
      "Nie zaczynasz od początku!",
      "Sprawnie i szybko dopracuj treść",
      "Bez żmudnego przepisywania CV",
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
    assert.doesNotMatch(offerMarkup, /dopasuj treść do oferty|układ/i);
    for (let index = 1; index < capabilities.length; index += 1) {
      assert.ok(
        offerMarkup.indexOf(capabilities[index - 1]) < offerMarkup.indexOf(capabilities[index]),
      );
    }
    assert.doesNotMatch(statementMarkup, /<em>|<u>/);

    assert.match(source, /<p id="template-gallery-title" className=\{classes.templateGalleryLabel\}>Szablony CV<\/p>/);
    assert.doesNotMatch(source, /Klasyczny, nowoczesny, techniczny albo editorial\./);
    assert.match(source, /Stwórz CV w wybranym szablonie/);
    assert.match(styles, /\.templatesSection\s*\{[^}]*background:\s*var\(--paper\);/s);
    assert.match(styles, /\.offerIntro\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:/s);
    assert.match(styles, /\.offerStatement h2\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:/s);
    assert.match(styles, /\.offerStatement h2 > span\s*\{[^}]*display:\s*block;[^}]*line-height:\s*1\.04;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*?\.offerIntro\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it("keeps the retained template, privacy, pricing, and FAQ caveats", () => {
    assert.match(source, /Twoje dokumenty nie są publiczne/);
    assert.match(source, /Bez żmudnego przepisywania CV/);
    assert.match(source, /Nie jest to gwarancja identycznego wyniku w każdym systemie rekrutacyjnym/);
  });

  it("keeps pricing copy stable and separates the Free and Pro plans", () => {
    assert.match(
      source,
      /<h2>\s*<span>Gotowe CV za 0 zł\.<\/span>\s*<em>Pro, gdy chcesz więcej\.<\/em>\s*<\/h2>/s,
    );
    assert.match(styles, /\.pricingHeading h2\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--space-2\);[^}]*line-height:\s*1\.08;/s);
    assert.match(styles, /\.pricingHeading h2 > span,[\s\S]*?\.pricingHeading h2 > em\s*\{[^}]*display:\s*block;[^}]*max-width:\s*100%;[^}]*line-height:\s*1\.08;[^}]*overflow-wrap:\s*break-word;/s);
    assert.match(styles, /\.pricingGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*gap:\s*clamp\(var\(--space-8\), 5vw, var\(--space-16\)\);[^}]*max-width:\s*1040px;/s);
    assert.match(styles, /\.priceCard\s*\{[^}]*min-width:\s*0;[^}]*border:\s*1px solid var\(--ink\);[^}]*overflow-wrap:\s*break-word;/s);
    assert.doesNotMatch(styles, /\.priceCard \+ \.priceCard\s*\{/);
    assert.match(styles, /@media \(max-width: 880px\)[\s\S]*?\.pricingGrid\s*\{[^}]*gap:\s*var\(--space-12\);/s);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.pricingGrid\s*\{[^}]*gap:\s*var\(--space-8\);/s);
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
      "hero_new_cv",
      "hero_import",
      "templates_new_cv",
      "pricing_free",
      "pricing_pro",
    ]) {
      assert.match(source, new RegExp(`event=\\"${event}\\"|queueGuestEvent\\(\\"${event}\\"\\)`));
    }

    assert.match(source, /buildStartUrl\("new", "free"\)/);
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
