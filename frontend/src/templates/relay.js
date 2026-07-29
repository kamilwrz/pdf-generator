import API_BASE_URL from "../services/api";
import { block, bulleted, circle, ellipse, line, text } from "./helpers";

const BLACK = "#121416";
const RED = "#EE2525";
const ORANGE = "#F47B20";
const SILVER = "#D6D9D9";
const STEEL = "#92989C";
const WHITE = "#F7F6F1";
const SANS = "Inter";
const MONO = "Courier";
const BACKGROUND = `${API_BASE_URL}/template-assets/relay-it-signal.png`;

const bold = (element) => ({ ...element, bold: true });
const tracked = (element, letterSpacing) => ({ ...element, letterSpacing });
const rect = (left, top, width, height, color, borderWidth = 1, zIndex = 1) => (
    { category: "rectangle", left, top, width, height, backgroundColor: color, borderWidth, zIndex }
);

// Relay — a dark signal-routing poster. The type is deliberately compact and
// laser-clear, framed by modular nodes that echo systems in transit.
export const relayTemplate = [
    {
        category: "image",
        src: BACKGROUND,
        width: 595,
        height: 842,
        left: 0,
        top: 0,
        zIndex: 0,
        fixedToPage: true,
    },
    line(164, 43, 4, 106, RED, 3),
    tracked(text("JULIA NOWAK", 30, SANS, WHITE, 190, 49, 3), 0.3),
    tracked(text("DEVOPS ENGINEER / RELIABILITY", 8.7, MONO, ORANGE, 192, 91, 3), 0.9),
    text("julia.nowak@email.com  ·  +48 600 000 000  ·  Kraków", 8.5, SANS, SILVER, 192, 119, 3),

    { ...rect(428, 51, 18, 18, RED, 1.2, 3), id: "relay-module-one" },
    { ...circle(471, 52, 18, ORANGE, true, 1, 3), id: "relay-module-two" },
    { ...ellipse(511, 53, 28, 17, SILVER, false, 1.1, 3), id: "relay-module-three" },
    line(446, 59, 25, 1, ORANGE, 2),
    line(489, 60, 22, 1, SILVER, 2),
    { ...rect(164, 181, 13, 13, RED, 1.2, 3), id: "relay-profile" },
    tracked(text("PROFIL", 8.3, MONO, ORANGE, 192, 181, 3), 1.1),
    line(192, 200, 340, 1, "#596065", 2),
    block(
        "Inżynierka platformowa, która zamienia złożone środowiska w przewidywalne systemy. Buduję ścieżki dostarczania, monitoring i praktyki, które pozwalają zespołom pracować szybko oraz spokojnie.",
        192, 218, 340, 49, 9.9, 14.3, WHITE, SANS
    ),

    { ...circle(161, 311, 18, RED, false, 1.2, 3), id: "relay-experience" },
    tracked(text("DOŚWIADCZENIE", 8.3, MONO, ORANGE, 192, 314, 3), 1.1),
    line(192, 333, 340, 1, "#596065", 2),
    bold(text("Senior DevOps Engineer  /  Streamline", 10.8, SANS, WHITE, 192, 353, 3)),
    text("2021 – obecnie  ·  Platform & SRE", 8.6, SANS, STEEL, 192, 371, 3),
    bulleted(block(
        "• Zautomatyzowała ścieżki CI/CD dla usług o różnym poziomie krytyczności.\n• Zaprojektowała standard obserwowalności łączący metryki, logi i sensowne alerty.\n• Wspierała zespoły produktowe w budowaniu odporności oraz planowaniu zmian.",
        192, 389, 340, 60, 9.2, 13.1, WHITE, SANS
    )),
    bold(text("Cloud Engineer  /  Altitude", 10.8, SANS, WHITE, 192, 475, 3)),
    text("2017 – 2021  ·  Infrastructure", 8.6, SANS, STEEL, 192, 493, 3),
    bulleted(block(
        "• Utrzymywała infrastrukturę chmurową i usprawniała bezpieczne wdrożenia.\n• Rozwijała narzędzia, które zdejmowały powtarzalną pracę z zespołów developerskich.",
        192, 511, 340, 44, 9.2, 13.1, WHITE, SANS
    )),

    { ...ellipse(161, 606, 18, 18, ORANGE, false, 1.2, 3), id: "relay-stack" },
    tracked(text("TECHNOLOGIE I EDUKACJA", 8.3, MONO, ORANGE, 192, 610, 3), 1.1),
    line(192, 629, 340, 1, "#596065", 2),
    bold(text("Informatyka  /  AGH", 10.2, SANS, WHITE, 192, 648, 3)),
    text("2012 – 2017", 8.6, SANS, STEEL, 192, 666, 3),
    block(
        "Kubernetes  ·  Terraform  ·  AWS  ·  GitHub Actions  ·  Grafana\nSRE  ·  Incident response  ·  Infrastructure as code",
        192, 700, 340, 32, 9.1, 13, WHITE, SANS
    ),

    { ...line(192, 784, 340, 1, "#596065", 2), fixedToPage: true },
    { ...circle(192, 797, 7, RED, true, 1, 3), fixedToPage: true },
    { ...text("01", 8, MONO, SILVER, 517, 792, 3), fixedToPage: true },
];
