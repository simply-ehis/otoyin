"""Story and Project export to EPUB/PDF."""

from __future__ import annotations

import io
from html import escape as html_escape


def _build_epub_book(
    identifier: str,
    title: str,
    chapters: list,
    toc_entries: list,
    extra_css: str = "",
    author: str = "",
) -> bytes:
    """Build an EPUB book from pre-built chapters. Returns raw EPUB bytes."""
    try:
        from ebooklib import epub
    except ImportError as e:
        raise RuntimeError("ebooklib not installed — run: pip install ebooklib") from e

    book = epub.EpubBook()
    book.set_identifier(identifier)
    book.set_title(title)
    book.set_language("en")

    if author:
        book.add_author(author)

    spine = ["nav"]
    toc = []
    for idx, (chapter, link_title, link_id) in enumerate(chapters):
        file_name = chapter.file_name
        book.add_item(chapter)
        spine.append(chapter)
        toc.append(epub.Link(file_name, link_title, link_id))

    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    base_css = (
        "body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; }"
        " h1 { margin-top: 2em; } p { margin: 1em 0; }"
    )
    nav_css = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=base_css + extra_css,
    )
    book.add_item(nav_css)

    book.toc = toc
    book.spine = spine

    buffer = io.BytesIO()
    epub.write_epub(buffer, book, {})
    buffer.seek(0)
    return buffer.read()


def _make_chapter(title: str, file_name: str, content: str):
    """Create an EpubHtml chapter from a title and HTML content."""
    from ebooklib import epub

    ch = epub.EpubHtml(title=title, file_name=file_name, lang="en")
    ch.content = content
    return ch


def export_story_to_epub(
    story_id: str,
    story_data: dict,
    db,
) -> bytes:
    """Export a story to EPUB format."""
    chapters = []
    for idx, item in enumerate(story_data.get("items", [])):
        chapter_title = item.get("title", f"Chapter {idx + 1}")
        chapter_text = item.get("text", "")

        content = f"<h1>{html_escape(chapter_title)}</h1>\n"
        if chapter_text:
            for p in chapter_text.split("\n\n"):
                p = p.strip()
                if p:
                    content += f"<p>{html_escape(p)}</p>\n"

        ch = _make_chapter(chapter_title, f"chapter_{idx + 1}.xhtml", content)
        chapters.append((ch, chapter_title, f"ch{idx + 1}"))

    return _build_epub_book(
        story_id,
        story_data.get("title", "Untitled Story"),
        chapters,
        [],
        author=story_data.get("author", ""),
    )


def _get_pdf_styles():
    """Return common PDF styles used by both story and project PDF exports."""
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        spaceAfter=30,
        alignment=1,
    )
    heading_style = ParagraphStyle(
        "ChapterTitle",
        parent=styles["Heading2"],
        fontSize=18,
        spaceBefore=24,
        spaceAfter=12,
    )
    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontSize=12,
        leading=16,
        spaceAfter=12,
    )
    return styles, title_style, heading_style, body_style


def export_story_to_pdf(
    story_id: str,
    story_data: dict,
    db,
) -> bytes:
    """Export a story to PDF format."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
    except ImportError as e:
        raise RuntimeError("reportlab not installed — run: pip install reportlab") from e

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=inch, leftMargin=inch, topMargin=inch, bottomMargin=inch,
    )

    styles, title_style, chapter_style, body_style = _get_pdf_styles()
    elements = []

    # Title page
    elements.append(Paragraph(story_data.get("title", "Untitled Story"), title_style))
    if story_data.get("author"):
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(f"by {story_data['author']}", styles["Normal"]))
    elements.append(PageBreak())

    # Chapters
    for item in story_data.get("items", []):
        chapter_title = item.get("title", "Chapter")
        chapter_text = item.get("text", "")

        elements.append(Paragraph(chapter_title, chapter_style))
        elements.append(Spacer(1, 12))

        if chapter_text:
            for p in chapter_text.split("\n\n"):
                p = p.strip()
                if p:
                    elements.append(Paragraph(html_escape(p), body_style))

        elements.append(PageBreak())

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()


def export_project_to_epub(
    project_id: str,
    project_data: dict,
    db,
) -> bytes:
    """Export a standalone project to EPUB format."""
    extra_css = " strong { font-weight: bold; }"
    chapters = []
    scenes = project_data.get("scenes", [])

    if not scenes:
        script_text = project_data.get("script_text", "")
        if script_text:
            name = project_data.get("name", "Untitled Project")
            content = f"<h1>{html_escape(name)}</h1>\n"
            for p in script_text.split("\n\n"):
                p = p.strip()
                if p:
                    content += f"<p>{html_escape(p)}</p>\n"
            ch = _make_chapter(name, "chapter_1.xhtml", content)
            chapters.append((ch, name, "ch1"))
    else:
        for idx, scene in enumerate(scenes):
            scene_name = scene.get("name", f"Scene {idx + 1}")
            dialogue = scene.get("dialogue", [])

            content = f"<h1>{html_escape(scene_name)}</h1>\n"
            for d in dialogue:
                character = d.get("character", "Unknown")
                text = d.get("text", "")
                if text:
                    content += f"<p><strong>{html_escape(character)}:</strong> {html_escape(text)}</p>\n"

            ch = _make_chapter(scene_name, f"scene_{idx + 1}.xhtml", content)
            chapters.append((ch, scene_name, f"sc{idx + 1}"))

    return _build_epub_book(
        project_id, project_data.get("name", "Untitled Project"), chapters, [], extra_css=extra_css
    )


def export_project_to_pdf(
    project_id: str,
    project_data: dict,
    db,
) -> bytes:
    """Export a standalone project to PDF format."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
    except ImportError as e:
        raise RuntimeError("reportlab not installed — run: pip install reportlab") from e

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        rightMargin=inch, leftMargin=inch, topMargin=inch, bottomMargin=inch,
    )

    styles, title_style, scene_style, body_style = _get_pdf_styles()
    dialogue_style = ParagraphStyle(
        "Dialogue", parent=styles["Normal"], fontSize=12, leading=16,
        spaceAfter=8, leftIndent=36,
    )
    elements = []

    # Title page
    elements.append(Paragraph(project_data.get("name", "Untitled Project"), title_style))
    if project_data.get("description"):
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(project_data["description"], styles["Normal"]))
    elements.append(PageBreak())

    scenes = project_data.get("scenes", [])
    if not scenes:
        script_text = project_data.get("script_text", "")
        if script_text:
            for p in script_text.split("\n\n"):
                p = p.strip()
                if p:
                    elements.append(Paragraph(html_escape(p), styles["Normal"]))
    else:
        for scene in scenes:
            scene_name = scene.get("name", "Scene")
            dialogue = scene.get("dialogue", [])

            elements.append(Paragraph(scene_name, scene_style))
            elements.append(Spacer(1, 12))

            for d in dialogue:
                character = d.get("character", "Unknown")
                text = d.get("text", "")
                if text:
                    elements.append(Paragraph(
                        f"<b>{html_escape(character)}:</b> {html_escape(text)}",
                        dialogue_style,
                    ))

            elements.append(PageBreak())

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
