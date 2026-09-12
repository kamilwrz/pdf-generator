"""Generate EN previews through the production CV and PDF renderers.

Run from the repository root with backend/.venv/Scripts/python.exe.
Only Free element packs are written to frontend source; paid templates emit
raster previews only, preserving the server-side distribution boundary.
"""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from regenerate_template_starters import TEMPLATES, tag_flow_roles, relativize_assets
from render_iconic_mockups import render_theme, rasterize_first_page
from app.services.cv_generator import generate_resume
from app.services.entitlements import FREE_STARTER_TEMPLATE_IDS

ENGLISH_DEMO = {
    "name": "Julia Bernat", "title": "AML and Compliance Analyst",
    "email": "julia.bernat@example.com", "phone": "+48 512 340 780", "location": "Warsaw",
    "linkedin": "linkedin.com/in/jbernat", "language": "English",
    "summary": "AML analyst combining regulatory knowledge with disciplined delivery. I monitor transactions and prepare SAR reports, maintaining analytical quality and timely decisions without compromising accuracy.",
    "experience": [
        {"title": "AML Analyst", "company": "Crestmont Advisory", "city": "Warsaw", "period": "2022 – present", "bullets": ["Monitor transactions and investigate AML alerts for corporate clients.", "Perform CDD/EDD and prepare documentation meeting FIU requirements.", "Support second-line teams in escalating high-risk AML cases."]},
        {"title": "KYC Analyst", "company": "Baltic Trust Bank", "city": "Warsaw", "period": "2019 – 2022", "bullets": ["Reviewed client profiles and screened PEP, sanctions and adverse media.", "Maintained SAR report quality and timely responses to information requests."]},
        {"title": "Customer Service Specialist", "company": "Helios Services", "city": "Kraków", "period": "2016 – 2019", "bullets": ["Supported business clients and resolved operational enquiries.", "Worked with sales and risk teams to improve service quality."]},
    ],
    "education": [{"degree": "Bachelor of Laws", "school": "University of Warsaw", "period": "2012 – 2016"}, {"degree": "AML Foundations Certificate", "school": "ACAMS Academy", "period": "2021"}],
    "skills": ["AML/KYC", "Monitoring", "CDD/EDD", "SAR reports", "Transaction analysis", "PEP screening", "Sanctions", "SQL"],
    "languages": [{"name": "Polish", "level": "Native"}, {"name": "English", "level": "C1"}, {"name": "German", "level": "B2"}],
}

def main():
    previews = ROOT / "frontend/public/template-mockups/en"
    hero = ROOT / "frontend/public/hero-templates/en"
    packs = ROOT / "frontend/src/templates/en"
    for directory in (previews, hero, packs): directory.mkdir(parents=True, exist_ok=True)
    for template in TEMPLATES:
        cv = deepcopy(ENGLISH_DEMO)
        if template in {"atrium", "aurelia", "monument", "vellum", "cadenza"}:
            for entry in cv["experience"]: entry["bullets"] = entry["bullets"][:1]
            cv["education"] = cv["education"][:1]
            cv["skills"] = cv["skills"][:5]
            cv["summary"] = "AML analyst combining regulatory knowledge with disciplined delivery. I monitor transactions and prepare accurate SAR reports."
            cv["experience"][-1]["bullets"] = []
        elements = tag_flow_roles(relativize_assets(generate_resume(template, cv)))
        page = [element for element in elements if element.get("page", 1) == 1]
        png = rasterize_first_page(render_theme(template, page))
        (previews / f"{template}.png").write_bytes(png)
        image = Image.open(BytesIO(png))
        for width in (360, 595):
            image.resize((width, round(width * 842 / 595)), Image.Resampling.LANCZOS).save(hero / f"{template}-{width}.webp", quality=88)
        if template in FREE_STARTER_TEMPLATE_IDS:
            (packs / f"{template}.json").write_text(json.dumps(elements, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{template}: {len(page)} first-page elements", flush=True)

if __name__ == "__main__": main()
