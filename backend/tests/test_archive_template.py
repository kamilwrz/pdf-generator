import unittest

from app.services.cv_generator import generate_resume


ARCHIVE_CV = {
    "name": "Julia Bernat",
    "title": "Analityczka AML i Compliance",
    "email": "julia.bernat@example.com",
    "phone": "+48 512 340 780",
    "location": "Warszawa",
    "summary": "Analityczka AML łącząca wiedzę regulacyjną z dyscypliną wykonania.",
    "experience": [{
        "title": "Analityczka AML",
        "company": "Crestmont Advisory",
        "period": "2022 – obecnie",
        "bullets": ["Prowadzi monitoring transakcji i analizę alertów."],
    }],
    "education": [{
        "degree": "Licencjat Prawa",
        "detail": "UW Warszawa",
        "period": "2012 – 2016",
    }],
    "skills": ["AML/KYC", "Monitoring", "CDD/EDD"],
    "languages": ["Polski - ojczysty", "Angielski - C1"],
}


class ArchiveTemplateTests(unittest.TestCase):
    def test_archive_uses_wide_editorial_sidebar_and_own_visual_system(self):
        elements = generate_resume("archive", ARCHIVE_CV)

        paper = next(
            element for element in elements
            if element.get("fixedToPage") and element.get("width") == 595
            and element.get("height") == 842
        )
        rail = next(
            element for element in elements
            if element.get("fixedToPage") and element.get("left") == 0
            and element.get("width") == 210
        )
        self.assertEqual(paper["backgroundColor"], "#F3F0E9")
        self.assertEqual(rail["backgroundColor"], "#E6E5DD")

        name = next(element for element in elements if element.get("content") == "Julia Bernat")
        self.assertEqual(name["fontFamily"], "Lora")
        self.assertTrue(name["align"] == "center")

        text_families = {
            element.get("fontFamily")
            for element in elements
            if element.get("category") in {"text", "textarea"}
        }
        self.assertEqual(text_families, {"Lora", "Inter"})

        sidebar_chrome = [
            element for element in elements
            if element.get("flowRole") == "sidebar-chrome"
        ]
        self.assertGreaterEqual(len(sidebar_chrome), 3)
        self.assertTrue(all(element.get("flowLane") == "sidebar" for element in sidebar_chrome))


if __name__ == "__main__":
    unittest.main()
