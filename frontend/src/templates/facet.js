/**
 * Facet: white paper, angular inlays, Barlow Condensed and Lato, two flowing columns.
 *
 * This static starter is the backend generator's own output
 * (`backend/app/services/cv/templates/generators/facet.py`) for
 * representative demo content (Julia Bernat — three roles, one degree, five skills, and three languages, sized to fit page 1 of the mockup), so the
 * picker preview matches what `/ai/fill_template` produces pixel-for-pixel.
 * Image `src` values are stored relative and get the API base prepended at
 * load time. The array already carries `flowRole` / `flowGroup` /
 * `preserveInitialLayout` from the generator, so it is exported as-is (only
 * the image src is absolutised).
 */
import API_BASE_URL from "../services/api.js";

const FACET_ELEMENTS = [
  {
    "category": "line",
    "left": 0,
    "top": 0,
    "width": 595,
    "height": 842,
    "backgroundColor": "#FFFFFF",
    "zIndex": 0,
    "page": 1,
    "fixedToPage": true,
    "appearanceTemplateId": "facet",
    "appearanceSettings": {
      "palette": "olive",
      "textSize": "M"
    }
  },
  {
    "category": "line",
    "left": 0,
    "top": 0,
    "width": 210.0,
    "height": 842,
    "backgroundColor": "#F3F5EC",
    "zIndex": 1,
    "page": 1,
    "fixedToPage": true
  },
  {
    "category": "line",
    "left": 210.0,
    "top": 0,
    "width": 1.0,
    "height": 842,
    "backgroundColor": "#CDD4BD",
    "zIndex": 1,
    "page": 1,
    "fixedToPage": true
  },
  {
    "category": "line",
    "left": 0,
    "top": 0,
    "width": 595,
    "height": 144.5,
    "backgroundColor": "#FFFFFF",
    "zIndex": 2,
    "page": 1,
    "fixedToPage": true,
    "repeatOnContinuation": false
  },
  {
    "category": "text",
    "content": "01",
    "fontSize": 9,
    "fontFamily": "Lato",
    "color": "#62685D",
    "left": 531.0,
    "top": 806,
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "fixedToPage": true
  },
  {
    "category": "textarea",
    "content": "Julia Bernat",
    "left": 67.5,
    "top": 46.0,
    "width": 460.0,
    "height": 34,
    "fontSize": 30.0,
    "lineHeight": 34.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "BarlowCondensed",
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "center",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "masthead",
    "mastheadRole": "name",
    "mastheadBandId": "facet-masthead",
    "appearanceTypographyRole": "display"
  },
  {
    "category": "textarea",
    "content": "Analityczka AML i Compliance",
    "left": 67.5,
    "top": 86.0,
    "width": 460.0,
    "height": 15,
    "fontSize": 11.5,
    "lineHeight": 15.0,
    "letterSpacing": 2.0,
    "color": "#657537",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "center",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "masthead",
    "mastheadRole": "title",
    "mastheadBandId": "facet-masthead",
    "textTransform": "uppercase"
  },
  {
    "category": "image",
    "src": "/template-assets/iconic/facet-olive/phone.png",
    "left": 90.51624999999999,
    "top": 111.0,
    "width": 13.0,
    "height": 13.0,
    "zIndex": 3,
    "page": 1,
    "alignWithText": true,
    "flowRole": "masthead",
    "contactChannel": "phone",
    "contactBandId": "facet-contact"
  },
  {
    "category": "text",
    "content": "+48 512 340 780",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#62685D",
    "left": 106.51624999999999,
    "top": 111.0,
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "flowRole": "masthead",
    "contactChannel": "phone",
    "contactBandId": "facet-contact"
  },
  {
    "category": "image",
    "src": "/template-assets/iconic/facet-olive/email.png",
    "left": 193.15945,
    "top": 111.0,
    "width": 13.0,
    "height": 13.0,
    "zIndex": 3,
    "page": 1,
    "alignWithText": true,
    "flowRole": "masthead",
    "contactChannel": "email",
    "contactBandId": "facet-contact"
  },
  {
    "category": "text",
    "content": "julia.bernat@email.com",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#62685D",
    "left": 209.15945,
    "top": 111.0,
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "flowRole": "masthead",
    "contactChannel": "email",
    "contactBandId": "facet-contact"
  },
  {
    "category": "image",
    "src": "/template-assets/iconic/facet-olive/linkedin.png",
    "left": 318.42845,
    "top": 111.0,
    "width": 13.0,
    "height": 13.0,
    "zIndex": 3,
    "page": 1,
    "alignWithText": true,
    "flowRole": "masthead",
    "contactChannel": "linkedin",
    "contactBandId": "facet-contact"
  },
  {
    "category": "text",
    "content": "linkedin.com/in/jbernat",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#62685D",
    "left": 334.42845,
    "top": 111.0,
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "flowRole": "masthead",
    "contactChannel": "linkedin",
    "contactBandId": "facet-contact"
  },
  {
    "category": "image",
    "src": "/template-assets/iconic/facet-olive/location.png",
    "left": 445.61035,
    "top": 111.0,
    "width": 13.0,
    "height": 13.0,
    "zIndex": 3,
    "page": 1,
    "alignWithText": true,
    "flowRole": "masthead",
    "contactChannel": "location",
    "contactBandId": "facet-contact"
  },
  {
    "category": "text",
    "content": "Warszawa",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#62685D",
    "left": 461.61035,
    "top": 111.0,
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "flowRole": "masthead",
    "contactChannel": "location",
    "contactBandId": "facet-contact"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 128.5,
    "width": 511.0,
    "height": 18,
    "points": [
      [
        0,
        0.84
      ],
      [
        1,
        0
      ],
      [
        1,
        0.16
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "masthead",
    "id": "facet-masthead-ribbon"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 144.5,
    "width": 511.0,
    "height": 1,
    "backgroundColor": "#CDD4BD",
    "zIndex": 1,
    "page": 1,
    "flowRole": "masthead",
    "id": "facet-masthead-divider"
  },
  {
    "category": "text",
    "content": "",
    "left": 0,
    "top": 0,
    "width": 0,
    "height": 0,
    "fontSize": 1,
    "fontFamily": "Inter",
    "color": "#000000",
    "zIndex": 0,
    "page": 1,
    "flowRole": "masthead-anchor",
    "contactBand": {
      "id": "facet-contact",
      "mode": "centered",
      "anchor": {
        "centerX": 297.5,
        "startY": 111.0,
        "maxWidth": 460.0
      },
      "text": {
        "fontFamily": "Lato",
        "fontSizePt": 9.4,
        "colorHex": "#62685D"
      },
      "icon": {
        "sizePt": 13.0,
        "theme": "facet-olive"
      },
      "metrics": {
        "iconGap": 16.0,
        "itemPad": 14.0,
        "lineStep": 16.0,
        "charWidth": 5.2
      },
      "order": [
        "phone",
        "email",
        "linkedin",
        "location"
      ]
    },
    "contactBandId": "facet-contact"
  },
  {
    "category": "text",
    "content": "",
    "left": 0,
    "top": 0,
    "width": 0,
    "height": 0,
    "fontSize": 1,
    "fontFamily": "Inter",
    "color": "#000000",
    "zIndex": 0,
    "page": 1,
    "flowRole": "masthead-anchor",
    "mastheadIdentity": {
      "id": "facet-masthead",
      "name": {
        "defaultUppercase": false
      },
      "title": {
        "spec": {
          "category": "textarea",
          "content": "Analityczka AML i Compliance",
          "left": 67.5,
          "top": 86.0,
          "width": 460.0,
          "height": 15,
          "fontSizePt": 11.5,
          "lineHeight": 15.0,
          "fontFamily": "Lato",
          "colorHex": "#657537",
          "letterSpacing": 2.0,
          "align": "center",
          "autoHeight": true,
          "preserveInitialLayout": true,
          "textTransform": "uppercase",
          "bold": false,
          "italic": false,
          "underline": false,
          "zIndex": 3
        },
        "blockPt": 0.0,
        "present": true,
        "decorations": [],
        "reclaimPt": 0.0
      },
      "contactBandId": "facet-contact"
    },
    "mastheadBandId": "facet-masthead"
  },
  {
    "category": "text",
    "content": "PODSUMOWANIE ZAWODOWE",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#47552B",
    "left": 34.0,
    "top": 174.5,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 1.3,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 190.78,
    "width": 22,
    "height": 1.0,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 190.78,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "textarea",
    "content": "Analityczka AML łącząca wiedzę regulacyjną z dyscypliną wykonania. Prowadzę monitoring transakcji i raporty SAR, dbając o jakość analiz oraz terminowość decyzji bez utraty dokładności.",
    "left": 34.0,
    "top": 202.18,
    "width": 152.0,
    "height": 73,
    "fontSize": 8.3,
    "lineHeight": 12.04,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "content",
    "flowLane": "sidebar"
  },
  {
    "category": "text",
    "content": "UMIEJĘTNOŚCI",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#47552B",
    "left": 34.0,
    "top": 301.18,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 1.3,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 317.46,
    "width": 22,
    "height": 1.0,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 317.46,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "textarea",
    "content": "• AML/KYC\n• Monitoring\n• CDD/EDD\n• Raporty SAR\n• Analiza transakcyjna\n• Screening PEP\n• Sanctions\n• SQL",
    "left": 34.0,
    "top": 322.18,
    "width": 152.0,
    "height": 97.0,
    "fontSize": 8.3,
    "lineHeight": 12.04,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "content",
    "flowLane": "sidebar"
  },
  {
    "category": "text",
    "content": "JĘZYKI",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#47552B",
    "left": 34.0,
    "top": 431.18,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 1.3,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 447.46,
    "width": 22,
    "height": 1.0,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 447.46,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "textarea",
    "content": "Polski - ojczysty\nAngielski - C1\nNiemiecki - B2\nFrancuski - A2",
    "left": 34.0,
    "top": 452.18,
    "width": 152.0,
    "height": 49.0,
    "fontSize": 8.3,
    "lineHeight": 12.04,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "content",
    "flowLane": "sidebar"
  },
  {
    "category": "text",
    "content": "CERTYFIKATY",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#47552B",
    "left": 34.0,
    "top": 513.18,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 1.3,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 529.4599999999999,
    "width": 22,
    "height": 1.0,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 529.4599999999999,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "textarea",
    "content": "• ACAMS AML Foundations\n• ICA Certificate in Compliance\n• Szkolenie CDD/EDD",
    "left": 34.0,
    "top": 534.18,
    "width": 152.0,
    "height": 37.0,
    "fontSize": 8.3,
    "lineHeight": 12.04,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "content",
    "flowLane": "sidebar"
  },
  {
    "category": "text",
    "content": "ZAINTERESOWANIA",
    "fontSize": 9.4,
    "fontFamily": "Lato",
    "color": "#47552B",
    "left": 34.0,
    "top": 583.18,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 1.3,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "line",
    "left": 34.0,
    "top": 599.4599999999999,
    "width": 22,
    "height": 1.0,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "polygon",
    "left": 34.0,
    "top": 599.4599999999999,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "sidebar-chrome",
    "flowLane": "sidebar"
  },
  {
    "category": "textarea",
    "content": "• Automatyzacja procesów\n• Prawo finansowe\n• Analiza danych",
    "left": 34.0,
    "top": 604.18,
    "width": 152.0,
    "height": 37.0,
    "fontSize": 8.3,
    "lineHeight": 12.04,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 3,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowRole": "content",
    "flowLane": "sidebar"
  },
  {
    "category": "text",
    "content": "DOŚWIADCZENIE ZAWODOWE",
    "fontSize": 12.0,
    "fontFamily": "Lato",
    "color": "#252C24",
    "left": 245.0,
    "top": 174.5,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 0.8,
    "flowRole": "section-chrome"
  },
  {
    "category": "line",
    "left": 245.0,
    "top": 193.1,
    "width": 300.0,
    "height": 1,
    "backgroundColor": "#CDD4BD",
    "zIndex": 2,
    "page": 1,
    "flowRole": "section-chrome"
  },
  {
    "category": "polygon",
    "left": 245.0,
    "top": 193.1,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "section-chrome"
  },
  {
    "category": "textarea",
    "content": "Analityczka AML",
    "left": 245.0,
    "top": 202.1,
    "width": 300.0,
    "height": 15,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e65a07b6a60b",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Crestmont Advisory   ·   Warszawa   ·   2022 – obecnie",
    "left": 245.0,
    "top": 221.1,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e65a07b6a60b",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "• Prowadzi monitoring transakcji i analizę alertów AML dla klientów firmowych.\n• Realizuje CDD/EDD oraz przygotowuje dokumentację zgodną z wymogami FIU.\n• Wspiera zespół L2 przy eskalacjach spraw o podwyższonym ryzyku AML.",
    "left": 245.0,
    "top": 237.1,
    "width": 300.0,
    "height": 83,
    "fontSize": 9.5,
    "lineHeight": 13.8,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e65a07b6a60b",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Analityczka KYC",
    "left": 245.0,
    "top": 330.1,
    "width": 300.0,
    "height": 15,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-dda23a06d4ca",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Baltic Trust Bank   ·   Warszawa   ·   2019 – 2022",
    "left": 245.0,
    "top": 349.1,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-dda23a06d4ca",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "• Weryfikowała profile klientów oraz screening PEP, sanctions i media.\n• Utrzymywała jakość raportów SAR oraz terminowość odpowiedzi na RFI.",
    "left": 245.0,
    "top": 365.1,
    "width": 300.0,
    "height": 42,
    "fontSize": 9.5,
    "lineHeight": 13.8,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-dda23a06d4ca",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Specjalistka Obsługi Klienta",
    "left": 245.0,
    "top": 417.1,
    "width": 300.0,
    "height": 15,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-3d36929b23e2",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Helios Services   ·   Kraków   ·   2016 – 2019",
    "left": 245.0,
    "top": 436.1,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-3d36929b23e2",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "• Obsługiwała zamówienia i weryfikację danych klientów na rynkach DACH.",
    "left": 245.0,
    "top": 452.1,
    "width": 300.0,
    "height": 28,
    "fontSize": 9.5,
    "lineHeight": 13.8,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-3d36929b23e2",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Asystentka ds. zgodności",
    "left": 245.0,
    "top": 490.1,
    "width": 300.0,
    "height": 15,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-56fdd325820e",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Northline Operations   ·   Kraków   ·   2014 – 2016",
    "left": 245.0,
    "top": 509.1,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-56fdd325820e",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "• Przygotowywała dokumentację klientów i wspierała kontrole jakości danych.\n• Koordynowała odpowiedzi na zapytania operacyjne zespołów sprzedaży i ryzyka.",
    "left": 245.0,
    "top": 525.1,
    "width": 300.0,
    "height": 56,
    "fontSize": 9.5,
    "lineHeight": 13.8,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": true,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-56fdd325820e",
    "flowRole": "content"
  },
  {
    "category": "text",
    "content": "WYKSZTAŁCENIE",
    "fontSize": 12.0,
    "fontFamily": "Lato",
    "color": "#252C24",
    "left": 245.0,
    "top": 602.1,
    "zIndex": 3,
    "page": 1,
    "bold": true,
    "italic": false,
    "letterSpacing": 0.8,
    "flowRole": "section-chrome"
  },
  {
    "category": "line",
    "left": 245.0,
    "top": 620.7,
    "width": 300.0,
    "height": 1,
    "backgroundColor": "#CDD4BD",
    "zIndex": 2,
    "page": 1,
    "flowRole": "section-chrome"
  },
  {
    "category": "polygon",
    "left": 245.0,
    "top": 620.7,
    "width": 22,
    "height": 1,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        0.82,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "flowRole": "section-chrome"
  },
  {
    "category": "textarea",
    "content": "Licencjat Prawa",
    "left": 245.0,
    "top": 629.7,
    "width": 300.0,
    "height": 14,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e04044b69e73",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "UW Warszawa",
    "left": 245.0,
    "top": 647.7,
    "width": 300.0,
    "height": 14,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e04044b69e73",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "2012 – 2016",
    "left": 245.0,
    "top": 665.7,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-e04044b69e73",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "Certyfikat AML Foundations",
    "left": 245.0,
    "top": 687.7,
    "width": 300.0,
    "height": 14,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": true,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-343d85ce624e",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "ACAMS Academy",
    "left": 245.0,
    "top": 705.7,
    "width": 300.0,
    "height": 14,
    "fontSize": 11.2,
    "lineHeight": 14.0,
    "letterSpacing": 0,
    "color": "#252C24",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-343d85ce624e",
    "flowRole": "content"
  },
  {
    "category": "textarea",
    "content": "2021",
    "left": 245.0,
    "top": 723.7,
    "width": 300.0,
    "height": 12,
    "fontSize": 8.6,
    "lineHeight": 11.8,
    "letterSpacing": 0,
    "color": "#62685D",
    "fontFamily": "Lato",
    "zIndex": 2,
    "page": 1,
    "bold": false,
    "italic": false,
    "align": "left",
    "bulletList": false,
    "autoHeight": true,
    "preserveInitialLayout": true,
    "flowGroup": "record-343d85ce624e",
    "flowRole": "content"
  },
  {
    "category": "polygon",
    "left": 477,
    "top": 0,
    "width": 118,
    "height": 34,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        0
      ],
      [
        1,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "fixedToPage": true,
    "id": "facet-corner-1"
  },
  {
    "category": "polygon",
    "left": 446,
    "top": 0,
    "width": 108,
    "height": 34,
    "points": [
      [
        0,
        0
      ],
      [
        0.16,
        0
      ],
      [
        1,
        1
      ],
      [
        0.84,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#CDD4BD",
    "zIndex": 2,
    "page": 1,
    "fixedToPage": true
  },
  {
    "category": "polygon",
    "left": 0,
    "top": 810,
    "width": 118,
    "height": 32,
    "points": [
      [
        0,
        0
      ],
      [
        1,
        1
      ],
      [
        0,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#657537",
    "zIndex": 2,
    "page": 1,
    "fixedToPage": true
  },
  {
    "category": "polygon",
    "left": 70,
    "top": 817,
    "width": 82,
    "height": 25,
    "points": [
      [
        0,
        0
      ],
      [
        0.2,
        0
      ],
      [
        1,
        1
      ],
      [
        0.8,
        1
      ]
    ],
    "filled": true,
    "backgroundColor": "#CDD4BD",
    "zIndex": 2,
    "page": 1,
    "fixedToPage": true
  }
];

export const facetTemplate = FACET_ELEMENTS.map((element) => (
  element.category === "image" && typeof element.src === "string" && element.src.startsWith("/template-assets")
    ? { ...element, src: `${API_BASE_URL}${element.src}` }
    : element
));
