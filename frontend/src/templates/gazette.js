// Gazette — newspaper-style essay/article template (A4 portrait, "article"
// category). Classic editorial devices: kicker + double masthead rule,
// serif headline, italic standfirst, byline/dateline, TWO justified text
// columns with a hairline divider, an oxblood DROP CAP opening the text,
// section headings with accent rules, a framed pull-quote, an end-of-article
// tombstone (■) and a centered folio page number.
// The backend's article_generator.py mirrors these metrics — keep in sync.
import { text, line, block } from "./helpers";

const DARK = "#191B1E";   // masthead ink
const BODY = "#22262B";   // column text
const ACCENT = "#8C2F39"; // oxblood — drop cap, rules, end mark
const GRAY = "#6A7078";
const RULE = "#B9BEC6";
const SOFT = "#D9DCE1";
const S = "Times-Roman";
const I = "Inter";

const bold = (el) => ({ ...el, bold: true });
const ital = (el) => ({ ...el, italic: true });
const just = (el) => ({ ...el, align: "justify" });
const centered = (el) => ({ ...el, align: "center" });
const right = (el) => ({ ...el, align: "right" });

const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) =>
    ({ category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex });

export const gazetteTemplate = [
    // ---- masthead ----
    line(50, 55, 7, 7, ACCENT, 1),
    { ...text("THE GAZETTE · ESSAYS & IDEAS", 8.5, I, GRAY, 63, 54, 2) },
    line(50, 72, 495, 3, DARK, 1),
    line(50, 78, 495, 1, DARK, 1),
    bold(block("The Quiet Case for Slow Thinking in a Fast World", 50, 92, 495, 72, 29, 34, DARK, S)),
    ital(block("Everything around us optimises for the instant answer. The best work still comes from people who refuse to hurry theirs.", 50, 170, 495, 40, 12.5, 18, "#4A5058", S)),
    bold(text("By ADAM KOWALSKI", 9, I, DARK, 50, 216, 2)),
    right(block("Warsaw · July 2026 · 6 min read", 50, 214, 495, 12, 8.5, 11, GRAY, I)),
    line(50, 232, 495, 0.5, RULE, 1),

    // ---- column divider ----
    line(296, 244, 1, 470, SOFT, 1),

    // ---- LEFT column ----
    // drop cap + hanging first paragraph ("W" + "e like…" = "We like…")
    bold(text("W", 44, S, ACCENT, 50, 240, 2)),
    just(block(
        "e like to believe that speed is the same thing as intelligence. The fastest answer wins the meeting, the quickest reply wins the thread, and the person who hesitates looks unsure. Yet almost everything durable we have ever built was made slowly, by people who allowed themselves time.",
        104, 248, 183, 104, 9.5, 13.5, BODY, S
    )),
    just(block(
        "Slow thinking is not laziness. It is the discipline of letting a problem ripen: reading past the summary, sitting with the uncomfortable draft, walking away long enough for the obvious answer to reveal its flaws. It is the difference between work that merely ships and work that lasts.",
        50, 364, 237, 104, 9.5, 13.5, BODY, S
    )),
    line(50, 482, 24, 2, ACCENT, 2),
    bold(text("The cost of constant haste", 12.5, S, DARK, 50, 488, 2)),
    just(block(
        "The costs of haste hide in plain sight. Decisions get made twice — once quickly, then again properly after the rework. Meetings multiply because nobody had time to write the one clear page that would have made them unnecessary. We mistake motion for progress and exhaustion for effort.",
        50, 512, 237, 104, 9.5, 13.5, BODY, S
    )),
    just(block(
        "None of this argues against deadlines. Constraints are generous teachers, and urgency has saved many a wandering project. The argument is narrower: the default speed of our tools should not become the default speed of our judgment.",
        50, 624, 237, 78, 9.5, 13.5, BODY, S
    )),

    // ---- RIGHT column ----
    just(block(
        "There is a practical way to begin. Write before you discuss, and read before you write. Keep one hour a day that belongs to no notification. Ask, of every urgent request, what would happen if it were answered tomorrow — and notice how often the honest answer is: nothing.",
        308, 244, 237, 92, 9.5, 13.5, BODY, S
    )),
    // framed pull-quote
    rect(308, 349, 237, 86, SOFT, 1, 1),
    line(322, 361, 60, 2, ACCENT, 2),
    ital(centered(block("“Speed is a tool. Judgment is the craft.”", 322, 371, 209, 40, 13, 18, DARK, S))),
    centered(block("— the editors", 322, 411, 209, 12, 8.5, 11, GRAY, I)),
    just(block(
        "Institutions can help. Give reviews the time they claim to deserve. Reward the memo that prevented a project as loudly as the sprint that rescued one. Hire for the ability to say “I don't know yet” without flinching, because that sentence is where thinking starts.",
        308, 451, 237, 92, 9.5, 13.5, BODY, S
    )),
    line(308, 553, 24, 2, ACCENT, 2),
    bold(text("What slowness gives back", 12.5, S, DARK, 308, 559, 2)),
    just(block(
        "What does slowness give back? Depth, mostly. The slow reader finishes fewer books and remembers more of them. The slow writer publishes less and is quoted longer. In a culture that measures everything by throughput, patience has quietly become a competitive advantage.",
        308, 583, 237, 92, 9.5, 13.5, BODY, S
    )),
    // end-of-article tombstone
    line(308, 685, 7, 7, ACCENT, 2),

    // ---- folio ----
    line(50, 788, 495, 0.5, RULE, 1),
    centered(block("— 1 —", 50, 796, 495, 12, 8.5, 11, GRAY, I)),
];
