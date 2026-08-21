import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.services.cv_templates.registry import generate_resume

cv = {
  "name": "Mikhail Navumchyk",
  "title": "Junior Full-Stack Developer",
  "email": "test@example.com",
  "phone": "+48 000",
  "location": "Poznan, Poland",
  "summary": "Self-taught full-stack developer who built a production web app.",
  "experience": [
    {"title": "Full-Stack Developer (Solo) - Internship Management System",
     "company": "Wielkopolskie Technikum Zawodowe, Poznan", "period": "11/2025 - Present",
     "bullets": [
       "Designed and built a production web application that manages the school's entire student-internship workflow: placement assignment, company records, student insurance data, approval flows, and communication between students and administrators.",
       "Designed the full PostgreSQL database schema from scratch (students, workplaces, internships, approval workflows, notification templates).",
       "Built role-based access control with three user roles (Admin, Worker, Student) using ASP.NET Core Identity with JWT.",
       "Developed a bulk Excel import (ClosedXML) that adds the school's entire student list in a single click.",
       "Implemented an automated email notification system (background services + Mailgun) that reminds students of upcoming internships.",
       "Added workplace file storage via S3-compatible object storage (MinIO) with presigned URLs.",
       "Set up centralized error logging and monitoring with Serilog + Seq.",
       "Wrote unit and integration tests with xUnit, Moq, FluentAssertions, and TestContainers.",
       "Containerized the app with Docker and an Nginx reverse proxy; deployed to production - first on Azure, then migrated to a VPS.",
       "Structured the codebase with Clean Architecture and a Controller-Service-Repository flow.",
     ]},
  ],
  "education": [
    {"degree": "Technician in Computer Science (Programming)",
     "school": "Wielkopolskie Technikum Zawodowe",
     "city": "Poznan, Poland", "period": "2022 - 2027 (expected)",
     "bullets": ["Vocational qualifications: INF.02 & INF.03"]},
  ],
  "skills": ["C#", ".NET", "React", "PostgreSQL", "Docker", "Nginx", "Azure", "Git"],
  "languages": [{"name": "Polish", "level": "Fluent"}, {"name": "English", "level": "B2"}],
}

els = generate_resume("slate", cv)
for i, e in enumerate(els):
    e["element_id"] = e.get("element_id") or f"g-{i}"

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "slate_gen.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(els, f, ensure_ascii=False)

print("total", len(els), "-> wrote", out)
for i, e in enumerate(els):
    c = str(e.get("content") or "")
    if "WYKSZTA" in c.upper():
        print("EDU heading at", i, "lane", e.get("flowLane"), "role", e.get("flowRole"))
        for e2 in els[i:i+7]:
            print(" ", {"cat": e2.get("category"), "lane": e2.get("flowLane"), "role": e2.get("flowRole"),
                        "fs": e2.get("fontSize"), "w": e2.get("width"), "left": e2.get("left"),
                        "group": e2.get("flowGroup"), "c": str(e2.get("content") or "")[:22]})
        break
else:
    print("education NOT found as sidebar heading; scanning for main education text")
    for e in els:
        c = str(e.get("content") or "")
        if "Technician" in c or "Technikum" in c or "INF.02" in c:
            print("  ", {"lane": e.get("flowLane"), "role": e.get("flowRole"), "fs": e.get("fontSize"),
                         "w": e.get("width"), "left": e.get("left"), "c": c[:34]})
