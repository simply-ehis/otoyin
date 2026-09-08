"""Story and Project export to EPUB/PDF."""

from __future__ import annotations

import io
from html import escape as html_escape


def export_story_to_epub(
    story_id: str,
    story_data: dict,
    db,
) -> bytes:
    """Export a story to EPUB format.

    Args:
        story_id: The story ID
        story_data: Dict with story metadata and items
        db: Database session

    Returns:
        EPUB file as bytes
    """
    try:
        from ebooklib import epub
    except ImportError as e:
        raise RuntimeError("ebooklib not installed — run: pip install ebooklib") from e

    book = epub.EpubBook()
    book.set_identifier(story_id)
    book.set_title(story_data.get("title", "Untitled Story"))
    book.set_language("en")

    # Add author metadata if available
    if story_data.get("author"):
        book.add_author(story_data["author"])

    # Create chapters from story items
    chapters = []
    spine = ["nav"]
    toc = []

    for idx, item in enumerate(story_data.get("items", [])):
        chapter_title = item.get("title", f"Chapter {idx + 1}")
        chapter_text = item.get("text", "")

        # Create chapter content (HTML-escape all user content)
        content = f"<h1>{html_escape(chapter_title)}</h1>\n"
        if chapter_text:
            # Convert plain text to paragraphs
            paragraphs = chapter_text.split("\n\n")
            for p in paragraphs:
                p = p.strip()
                if p:
                    content += f"<p>{html_escape(p)}</p>\n"

        chapter = epub.EpubHtml(
            title=chapter_title,
            file_name=f"chapter_{idx + 1}.xhtml",
            lang="en",
        )
        chapter.content = content
        book.add_item(chapter)
        chapters.append(chapter)
        spine.append(chapter)
        toc.append(epub.Link(f"chapter_{idx + 1}.xhtml", chapter_title, f"ch{idx + 1}"))

    # Add navigation
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    # Define CSS
    style = "body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; } h1 { margin-top: 2em; } p { margin: 1em 0; }"
    nav_css = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=style,
    )
    book.add_item(nav_css)

    book.toc = toc
    book.spine = spine

    # Write to bytes
    buffer = io.BytesIO()
    epub.write_epub(buffer, book, {})
    buffer.seek(0)
    return buffer.read()


def export_story_to_pdf(
    story_id: str,
    story_data: dict,
    db,
) -> bytes:
    """Export a story to PDF format.

    Args:
        story_id: The story ID
        story_data: Dict with story metadata and items
        db: Database session

    Returns:
        PDF file as bytes
    """
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
    except ImportError as e:
        raise RuntimeError("reportlab not installed — run: pip install reportlab") from e

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        spaceAfter=30,
        alignment=1,  # Center
    )
    chapter_style = ParagraphStyle(
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

    story_elements = []

    # Title page
    story_elements.append(Paragraph(story_data.get("title", "Untitled Story"), title_style))
    if story_data.get("author"):
        story_elements.append(Spacer(1, 20))
        story_elements.append(Paragraph(f"by {story_data['author']}", styles["Normal"]))
    story_elements.append(PageBreak())

    # Chapters from story items
    for item in story_data.get("items", []):
        chapter_title = item.get("title", "Chapter")
        chapter_text = item.get("text", "")

        story_elements.append(Paragraph(chapter_title, chapter_style))
        story_elements.append(Spacer(1, 12))

        if chapter_text:
            paragraphs = chapter_text.split("\n\n")
            for p in paragraphs:
                p = p.strip()
                if p:
                    # Escape HTML entities for reportlab Paragraph
                    p = html_escape(p)
                    story_elements.append(Paragraph(p, body_style))

        story_elements.append(PageBreak())

    doc.build(story_elements)
    buffer.seek(0)
    return buffer.read()


def export_project_to_epub(
    project_id: str,
    project_data: dict,
    db,
) -> bytes:
    """Export a standalone project to EPUB format.

    Uses the project's scenes and script text.
    """
    try:
        from ebooklib import epub
    except ImportError as e:
        raise RuntimeError("ebooklib not installed — run: pip install ebooklib") from e

    book = epub.EpubBook()
    book.set_identifier(project_id)
    book.set_title(project_data.get("name", "Untitled Project"))
    book.set_language("en")

    chapters = []
    spine = ["nav"]
    toc = []

    scenes = project_data.get("scenes", [])
    if not scenes:
        # Fallback: use script_text as single chapter
        script_text = project_data.get("script_text", "")
        if script_text:
            content = f"<h1>{html_escape(project_data.get('name', 'Untitled Project'))}</h1>\n"
            paragraphs = script_text.split("\n\n")
            for p in paragraphs:
                p = p.strip()
                if p:
                    content += f"<p>{html_escape(p)}</p>\n"

            chapter = epub.EpubHtml(
                title=project_data.get("name", "Untitled Project"),
                file_name="chapter_1.xhtml",
                lang="en",
            )
            chapter.content = content
            book.add_item(chapter)
            chapters.append(chapter)
            spine.append(chapter)
            toc.append(epub.Link("chapter_1.xhtml", project_data.get("name", "Untitled Project"), "ch1"))
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

            chapter = epub.EpubHtml(
                title=scene_name,
                file_name=f"scene_{idx + 1}.xhtml",
                lang="en",
            )
            chapter.content = content
            book.add_item(chapter)
            chapters.append(chapter)
            spine.append(chapter)
            toc.append(epub.Link(f"scene_{idx + 1}.xhtml", scene_name, f"sc{idx + 1}"))

    # Add navigation
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    # CSS
    style = "body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; } h1 { margin-top: 2em; } p { margin: 1em 0; } strong { font-weight: bold; }"
    nav_css = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=style,
    )
    book.add_item(nav_css)

    book.toc = toc
    book.spine = spine

    buffer = io.BytesIO()
    epub.write_epub(buffer, book, {})
    buffer.seek(0)
    return buffer.read()


def export_project_to_pdf(
    project_id: str,
    project_data: dict,
    db,
) -> bytes:
    """Export a standalone project to PDF format."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer
    except ImportError as e:
        raise RuntimeError("reportlab not installed — run: pip install reportlab") from e

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=inch,
        leftMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=24,
        spaceAfter=30,
        alignment=1,
    )
    scene_style = ParagraphStyle(
        "SceneTitle",
        parent=styles["Heading2"],
        fontSize=18,
        spaceBefore=24,
        spaceAfter=12,
    )
    dialogue_style = ParagraphStyle(
        "Dialogue",
        parent=styles["Normal"],
        fontSize=12,
        leading=16,
        spaceAfter=8,
        leftIndent=36,
    )

    story_elements = []

    # Title page
    story_elements.append(Paragraph(project_data.get("name", "Untitled Project"), title_style))
    if project_data.get("description"):
        story_elements.append(Spacer(1, 20))
        story_elements.append(Paragraph(project_data["description"], styles["Normal"]))
    story_elements.append(PageBreak())

    scenes = project_data.get("scenes", [])
    if not scenes:
        # Use script text
        script_text = project_data.get("script_text", "")
        if script_text:
            paragraphs = script_text.split("\n\n")
            for p in paragraphs:
                p = p.strip()
                if p:
                    p = p.replace("&", "&").replace("<", "<").replace(">", ">")
                    story_elements.append(Paragraph(p, styles["Normal"]))
    else:
        for scene in scenes:
            scene_name = scene.get("name", "Scene")
            dialogue = scene.get("dialogue", [])

            story_elements.append(Paragraph(scene_name, scene_style))
            story_elements.append(Spacer(1, 12))

            for d in dialogue:
                character = d.get("character", "Unknown")
                text = d.get("text", "")
                if text:
                    text = text.replace("&", "&").replace("<", "<").replace(">", ">")
                    story_elements.append(Paragraph(f"<b>{character}:</b> {text}", dialogue_style))

            story_elements.append(PageBreak())

    doc.build(story_elements)
    buffer.seek(0)
    return buffer.read()
