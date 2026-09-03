"""Build the polished ADTC 2026 submission pack DOCX."""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "ADTC-2026-Otoyin-Submission-Pack.docx"
ROSE = RGBColor(190, 79, 105)
DARK = RGBColor(38, 35, 42)
MUTED = RGBColor(101, 96, 101)
GOLD = RGBColor(202, 151, 55)
PALE_ROSE = "F9EEF1"
PALE_GRAY = "F4F6F9"


def set_cell_shading(cell, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    shading = properties.find(qn("w:shd"))
    if shading is None:
        shading = OxmlElement("w:shd")
        properties.append(shading)
    shading.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=120, bottom=90, end=120) -> None:
    properties = cell._tc.get_or_add_tcPr()
    margins = properties.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        properties.append(margins)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_run(run, size=11, color=DARK, bold=False, italic=False) -> None:
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.bold = bold
    run.italic = italic


def add_text(doc, text, size=11, color=DARK, bold=False, italic=False, align=None, after=8):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(after)
    paragraph.paragraph_format.line_spacing = 1.2
    if align is not None:
        paragraph.alignment = align
    run = paragraph.add_run(text)
    set_run(run, size, color, bold, italic)
    return paragraph


def add_heading(doc, text, level=1):
    paragraph = doc.add_paragraph()
    paragraph.style = f"Heading {level}"
    paragraph.paragraph_format.keep_with_next = True
    run = paragraph.add_run(text)
    set_run(run, {1: 16, 2: 13, 3: 12}[level], ROSE if level < 3 else DARK, True)
    return paragraph


def add_bullets(doc, items):
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.line_spacing = 1.15
        run = paragraph.add_run(item)
        set_run(run)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    if widths:
        for row in table.rows:
            for cell, width in zip(row.cells, widths):
                cell.width = Inches(width)
    for index, header in enumerate(headers):
        cell = table.rows[0].cells[index]
        set_cell_shading(cell, PALE_GRAY)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        paragraph = cell.paragraphs[0]
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(header)
        set_run(run, 9.5, DARK, True)
    for row_values in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row_values):
            set_cell_margins(cells[index])
            paragraph = cells[index].paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            run = paragraph.add_run(value)
            set_run(run, 9.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def add_callout(doc, label, body, fill=PALE_ROSE):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, top=130, start=180, bottom=130, end=180)
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(3)
    run = paragraph.add_run(label)
    set_run(run, 10, ROSE, True)
    paragraph.add_run("\n")
    run = paragraph.add_run(body)
    set_run(run, 10.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_code(doc, text):
    table = doc.add_table(rows=1, cols=1)
    cell = table.cell(0, 0)
    set_cell_shading(cell, "28252B")
    set_cell_margins(cell, top=110, start=150, bottom=110, end=150)
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(text)
    set_run(run, 8.5, RGBColor(245, 242, 238))
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def configure_document(doc):
    section = doc.sections[0]
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.78)
    section.right_margin = Inches(0.78)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.333
    for level, before, after in ((1, 18, 10), (2, 12, 6), (3, 8, 4)):
        style = doc.styles[f"Heading {level}"]
        style.font.name = "Calibri"
        style.font.size = Pt({1: 16, 2: 13, 3: 12}[level])
        style.font.bold = True
        style.font.color.rgb = ROSE if level < 3 else DARK
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run("21labs  |  ADTC 2026  |  DRAFT")
    set_run(run, 8.5, MUTED, True)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("Otoyin submission pack  •  ")
    set_run(run, 8, MUTED)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)


def build():
    doc = Document()
    configure_document(doc)

    add_text(doc, "AFRICA DEEP TECH CHALLENGE 2026", 10, GOLD, True, align=WD_ALIGN_PARAGRAPH.CENTER, after=12)
    add_text(doc, "Otoyin", 32, DARK, True, align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
    add_text(doc, "An Offline Audio-Production Agent for Budget Laptops", 16, ROSE, False, align=WD_ALIGN_PARAGRAPH.CENTER, after=8)
    add_text(doc, "Devpost form • Official-template handoff • Technical report • Demo script", 10.5, MUTED, False, align=WD_ALIGN_PARAGRAPH.CENTER, after=22)
    add_callout(doc, "SUBMISSION STATUS", "Draft prepared from the official ADTC template. No submission has been sent. Complete the owner-only fields and official profiler evidence for an organizer reopening or the next ADTF round.")
    add_table(doc, ["Field", "Current draft"], [
        ("Recommended domain", "Autonomous AI Agents (`autonomous_ai_agents`)"),
        ("Model candidate", "Qwen3.5-2B.Q4_K_M via llama.cpp"),
        ("Product", "Otoyin / 21labs offline voice and audio workstation"),
        ("Prepared", "25 August 2026"),
        ("Readiness", "6/10 — credible product story; owner verification and official measurement remain"),
    ], [1.65, 4.75])
    add_text(doc, "Use this document alongside the public product repository and a public fork of the official ADTC submission template.", 10.5, MUTED, italic=True, after=12)

    add_heading(doc, "1. Timing and readiness", 1)
    add_callout(doc, "TIMING NOTE", "The live Devpost page currently says that this hackathon has ended. Do not submit from this draft. Keep the package ready for organizer reopening, a correction window, or the next ADTF challenge, and re-check the official rules before publishing.", "FFF6E5")
    add_table(doc, ["Area", "Rating", "Assessment"], [
        ("Product concept", "8/10", "Clear offline creator-workstation story with a real in-app agent and MCP surface."),
        ("On-device agent fit", "8/10", "Local GGUF planners, llama.cpp, structured routing, and shared workflow skills."),
        ("ADTC packaging", "6/10", "Template-shaped draft, model downloader, report, and reproducibility notes are prepared; public fork and owner fields remain."),
        ("Benchmark evidence", "3/10", "Exact GGUF is present and the CPU runtime path is identified; no submission-valid profiler JSON is attached."),
        ("Devpost readiness", "4/10", "Narrative is ready; identity, URLs, model packaging, licenses, and eligibility remain."),
    ], [1.45, 0.7, 4.25])
    add_heading(doc, "Owner-only fields", 2)
    add_bullets(doc, [
        "[TEAM ID], [SUBMITTER NAME], [SUBMITTER EMAIL], [GITHUB HANDLE], and [COUNTRY].",
        "[PUBLIC PRODUCT REPOSITORY URL], [PUBLIC ADTC SUBMISSION REPOSITORY URL], and [DEMO VIDEO URL].",
        "Exact model-card URL, redistribution license, final GGUF filename, and final profiler measurements.",
        "A concrete local context and tested language evidence if claiming the African Use Case Bonus.",
    ])

    add_heading(doc, "2. Devpost form — copy-ready", 1)
    add_heading(doc, "Project title", 2)
    add_callout(doc, "COPY", "Otoyin: An Offline Audio-Production Agent for Budget Laptops")
    add_heading(doc, "Tagline", 2)
    add_callout(doc, "COPY", "Local AI that plans, cleans, mixes, and exports voice content without cloud access.")
    add_heading(doc, "Short description", 2)
    add_text(doc, "Otoyin is an offline voice and audio workstation whose local AI agent turns plain-language production requests into safe, repeatable audio workflows. It can plan voiceover, podcast, audiobook, ADR, cleanup, mixing, mastering, and export tasks, then call local audio tools through the same skill catalog exposed to both the in-app assistant and the 21labs MCP interface. The goal is practical creative autonomy on the hardware many African creators actually have: a normal laptop, intermittent connectivity, limited RAM, and no dependable cloud budget.")
    add_heading(doc, "Full project description", 2)
    add_text(doc, "Audio production software is powerful but fragmented. A creator may need transcription, voice generation, noise reduction, loudness control, music or effects, routing, and export — often across several applications and with an internet connection assumed at every step. That assumption excludes creators working with unreliable connectivity, expensive data, privacy-sensitive recordings, or modest hardware.")
    add_text(doc, "Otoyin is a local-first audio workstation built around that constraint. The user describes the outcome in natural language — for example, “clean this interview, duck the music under the speech, and export a podcast master” — and the on-device assistant converts the request into a structured plan. It selects the relevant workflow skill, asks only for missing information, executes reversible operations, and reports what changed. The same capability is available inside the app and through an MCP interface, so a local agent can drive the studio without a cloud API.")
    add_text(doc, "The agent uses a GGUF planner through llama.cpp, a shared manifest for assistant/MCP instructions, confidence-aware tool routing, and a local catalog of audio operations. Otoyin includes loading and progress states so model startup and long-running audio work are visible instead of becoming silent waits. All core processing is designed to run on-device; the network is used only for an explicit model download or optional user-controlled integrations, never for inference.")
    add_text(doc, "For ADTC, we will package the selected planner as a public GGUF download with the official template, exactly two domain prompts, and profiler measurements on the standard laptop profile. The submission will report measured RAM, latency, throughput, and thermals rather than estimated performance.")
    add_heading(doc, "Why this is an African deep-tech use case", 2)
    add_text(doc, "The intended users are independent creators, community-radio producers, educators, journalists, and small media teams who need reliable voice production without sending recordings or prompts to a remote service. Otoyin treats connectivity, privacy, power, and RAM as product requirements instead of afterthoughts.")
    add_callout(doc, "BONUS CLAIM", "Keep `african_alpha_claim` false until a concrete local deployment context, verified user or partner statement, and tested language or workflow claim are attached.", "FFF6E5")
    add_heading(doc, "Why this is an autonomous-agent submission", 2)
    add_text(doc, "This is not only an audio editor with a chat box. The local agent follows an observable loop: interpret intent, select a relevant skill, ask for missing constraints, produce an ordered plan, call bounded tools, and report measurements and exports. The shared skill catalog bridges the desktop assistant and 21labs MCP surface; the surrounding application is not presented as a substitute for model evidence.")
    add_heading(doc, "Judge objection check", 2)
    add_bullets(doc, [
        "Not a cloud wrapper: core inference and audio processing are local after the explicit model download.",
        "Not only an audio app: the evaluated contribution is intent-to-plan-to-tool workflow generation.",
        "Not a generic African claim: `african_alpha_claim` stays false until a concrete context and tested evidence exist.",
        "Not marketing numbers: unmeasured performance fields remain blank until the official profiler supplies them.",
    ])
    add_heading(doc, "Built with", 2)
    add_text(doc, "llama.cpp, GGUF, local Python services, FastAPI, React, TypeScript, Tauri, local audio engines, shared assistant/MCP tool schemas, and offline model lifecycle controls.")
    add_heading(doc, "Links and team", 2)
    add_bullets(doc, [
        "Product repository: [PUBLIC PRODUCT REPOSITORY URL]",
        "ADTC template submission repository: [PUBLIC ADTC SUBMISSION REPOSITORY URL]",
        "Demo video: [DEMO VIDEO URL]",
        "Team: [TEAM NAME] — [SUBMITTER NAME] and [OTHER TEAM MEMBERS, IF ANY]",
        "Contact: [SUBMITTER EMAIL]  |  Country: [COUNTRY]",
    ])

    add_heading(doc, "3. Official-template handoff", 1)
    add_text(doc, "The ADTC entry should be a public fork of the official template, not only a link to the main Otoyin product repository. The local draft folder created with this pack mirrors the required structure.")
    add_code(doc, "your-adtc-submission/\n├── metadata.json\n├── download_model.sh\n├── REPORT.md\n├── .gitignore\n└── model/\n    └── Qwen3.5-2B.Q4_K_M.gguf   # downloaded by the script; never committed")
    add_heading(doc, "metadata.json — final shape", 2)
    add_code(doc, '{\n  "team_id": "[TEAM ID]",\n  "domain": "autonomous_ai_agents",\n  "language_scope": ["en"],\n  "african_alpha_claim": false,\n  "budget_laptop_claim": true,\n  "submitter": {"name": "[SUBMITTER NAME]", "email": "[SUBMITTER EMAIL]", "github_handle": "[GITHUB HANDLE]"},\n  "cross_disciplinary_pairing": {\n    "discipline": "audio production",\n    "load_bearing": true,\n    "description": "The planner turns real audio-production requests into ordered, safe, tool-ready workflows for creators."\n  },\n  "test_prompts": [\n    {"prompt_id": "tp_001", "prompt": "Create a production plan for a 30-second community-radio announcement about safe water in [TARGET COUNTRY OR REGION]. Return the audience, a concise voiceover script, recording guidance, and an ordered post-production plan. State assumptions and avoid inventing local facts."},\n    {"prompt_id": "tp_002", "prompt": "A creator has one interview recording, one music bed, and a 45-second intro. Produce an ordered, tool-ready plan to clean the speech, remove long silences without damaging words, duck the music under speech, normalize the finished mix, and export a shareable podcast file. State what must be confirmed before execution."}\n  ],\n  "model": {"name": "Qwen3.5-2B.Q4_K_M", "runtime": "llama.cpp", "quantization": "GGUF Q4_K_M", "parameters_estimate": "2B", "packaging": "binary_bundle"},\n  "_runtime": {"model_path": "model/Qwen3.5-2B.Q4_K_M.gguf"}\n}')
    add_heading(doc, "Downloader and model", 2)
    add_bullets(doc, [
        "Use the official template downloader pattern: public URL, idempotent behavior, partial file, then atomic move.",
        "The current Otoyin planner configuration points to Jackrong’s public Qwen3.5-2B GGUF repository and the `Qwen3.5-2B.Q4_K_M.gguf` file.",
        "Verify the exact model card, license, file checksum, and llama.cpp compatibility before publishing.",
        "After download, disable networking and confirm that inference makes no outbound request.",
    ])

    add_heading(doc, "4. REPORT.md — technical report", 1)
    add_text(doc, "Use the following as the report body inside the official template repository. Keep the final version factual and concise.")
    add_heading(doc, "Problem", 2)
    add_text(doc, "Independent creators and small media teams need to turn speech recordings into usable voice content, but the workflow is normally split across transcription, generation, cleanup, mixing, mastering, and export tools. Cloud-first assistants add recurring cost, require stable connectivity, and create privacy concerns for interviews, journalism, education, and community media.")
    add_text(doc, "Otoyin addresses this with a local audio workstation and an on-device agent. A user describes the desired result in plain language; the planner converts that request into an ordered workflow, selects the relevant audio-production skill, and exposes the next actions clearly. The design target is a creator using an ordinary laptop with limited RAM and no guaranteed internet connection.")
    add_heading(doc, "Design decisions", 2)
    add_bullets(doc, [
        "Base model: Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled from the public Jackrong GGUF repository.",
        "Quantization: Q4_K_M, selected as the starting balance between reasoning quality, model memory, and CPU feasibility.",
        "Runtime: llama.cpp with GGUF weights, as required by the challenge and appropriate for CPU-first local inference.",
        "Tool routing: shared agent manifest and structured tool schemas keep the in-app assistant and MCP surface aligned.",
        "Safety: explicit and reversible execution where supported; assumptions and errors are reported rather than hidden.",
    ])
    add_heading(doc, "Alternatives and constraints", 2)
    add_text(doc, "A larger planner may improve reasoning but reduces headroom on an 8 GB machine and increases cold-start and thermal risk. A smaller planner reduces memory pressure but may be less reliable on long workflows. A cloud LLM violates the offline requirement and weakens privacy and availability. Relevant-skill selection avoids dumping every tool into every prompt.")
    add_bullets(doc, [
        "8 GB RAM target, integrated graphics, CPU inference, Ubuntu 22.04 LTS.",
        "The official evaluation treats 7 GB as the memory ceiling; an out-of-memory or crash result is disqualifying.",
        "Inference must be fully offline after the model download step.",
        "Loading and progress states keep model startup and audio work visible.",
    ])
    add_heading(doc, "Benchmarks — populate before submission", 2)
    add_table(doc, ["Metric", "Measured value"], [
        ("Machine", "[MEASURED HARDWARE]"),
        ("Operating system", "[OS VERSION]"),
        ("CPU / cores", "[CPU]"),
        ("RAM", "[TOTAL RAM]"),
        ("Model file size", "1.27 GB repository listing; verify downloaded file"),
        ("Peak RSS", "[PEAK RSS MB]"),
        ("Steady-state RSS", "[STEADY RSS MB]"),
        ("Time to first token", "[TTFT MS]"),
        ("Generation speed", "[TOKENS/SECOND]"),
        ("Prompt processing speed", "[PROMPT TOKENS/SECOND]"),
        ("Thermals", "[NONE / DETAILS]"),
        ("Profiler output", "[LINK OR submission.json]"),
    ], [2.2, 4.2])
    add_callout(doc, "IMPORTANT", "Do not replace these fields with estimates from the development machine. The official profiler output is the evidence that matters.", "FFF6E5")
    add_text(doc, "Preparation note: the exact local GGUF is 1,270,804,416 bytes. The CPU-only runtime exists, but the first profiler route selected a Vulkan launcher and failed at an integrated-GPU allocation; a bounded CPU smoke run did not complete within the desktop command window. This is diagnostic evidence only, not a passing benchmark.", 9.5, MUTED, italic=True)
    add_heading(doc, "Reproduction", 2)
    add_code(doc, "git clone [PUBLIC ADTC SUBMISSION REPOSITORY URL]\ncd [SUBMISSION DIRECTORY]\nbash download_model.sh\nadtc-profiler run --submission . --mode participant --output submission.json")
    add_heading(doc, "Attribution", 2)
    add_bullets(doc, [
        "Otoyin / 21labs: [LICENSE AND REPOSITORY LINK]",
        "llama.cpp: [EXACT VERSION AND LICENSE LINK]",
        "Selected GGUF model: https://huggingface.co/Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF",
        "Audio libraries and bundled engines: [LIST LICENSES USED IN THE SUBMISSION]",
    ])

    add_heading(doc, "5. Two-minute demo script", 1)
    add_table(doc, ["Time", "Shot and narration"], [
        ("0:00–0:12", "Problem: audio production is fragmented and often cloud-dependent. Show the Otoyin logo and local model indicator."),
        ("0:12–0:32", "Request: “Clean this interview, duck the music under the speech, master it for a podcast, and export it.” Show the assistant selecting a skill."),
        ("0:32–0:58", "Local agent: show llama.cpp/local model status and the structured plan. Say the request, reasoning, and audio stay local after download."),
        ("0:58–1:25", "Execution: show cleanup, ducking, loudness, export, progress state, and one before/after audio view."),
        ("1:25–1:45", "Shared skills: show the same skill in the in-app assistant and MCP surface."),
        ("1:45–2:00", "Why it matters: local creative infrastructure without cloud cost, private-recording upload, or a workstation GPU. End on URLs and benchmark panel."),
    ], [1.0, 5.4])

    add_heading(doc, "6. Final submission gate", 1)
    add_bullets(doc, [
        "Devpost is open for the relevant round, or the organizer has confirmed a reopening or correction window.",
        "Eligibility is confirmed: African residence, adult status, team size, early-stage status, funding cap, and original work.",
        "Official template is forked and public; metadata has no placeholders and exactly two prompts.",
        "Model is a public GGUF and runs with llama.cpp; downloader succeeds from a clean clone and is idempotent.",
        "No GGUF weights are committed; model/ and *.gguf are ignored.",
        "Profiler smoke test succeeds; peak memory is below the ceiling; no OOM or thermal throttling.",
        "Product repo, submission repo, screenshots, and two-minute video work in a private browser window.",
        "African Use Case Bonus is evidenced or left false.",
        "No submission has been sent from this draft without an explicit owner decision.",
    ])
    add_heading(doc, "7. Official sources", 1)
    add_bullets(doc, [
        "Devpost challenge: https://adtc-2026.devpost.com/",
        "Devpost rules: https://adtc-2026.devpost.com/rules",
        "ADTF challenge brief and scoring: https://africadeeptech.org/challenge-2026/",
        "Official template: https://github.com/Africa-Deep-Tech-Foundation/adtc-2026-submission-template",
        "Official profiler: https://github.com/Africa-Deep-Tech-Foundation/adtc-profiler",
    ])

    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    build()
