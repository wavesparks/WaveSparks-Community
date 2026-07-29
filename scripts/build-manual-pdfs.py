#!/usr/bin/env python3
"""Build the WaveSparks English and Chinese manuals as polished PDF files.

The renderer intentionally supports the small, predictable Markdown subset used by
the project manuals: headings, paragraphs, lists, block quotes, fenced code,
tables, local images, links, and horizontal rules. It does not attempt to be a
general CommonMark implementation.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Sequence

try:
    from reportlab.lib import colors
    from reportlab.lib.colors import HexColor
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.fonts import addMapping
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        BaseDocTemplate,
        Flowable,
        HRFlowable,
        Image,
        KeepTogether,
        LongTable,
        PageBreak,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )
    from reportlab.platypus.tableofcontents import TableOfContents
except ImportError as exc:  # pragma: no cover - environment-dependent message
    raise SystemExit(
        "ReportLab is required. Use the bundled Codex Python runtime or install "
        "it with: python3 -m pip install reportlab"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "docs" / "manuals"
DEFAULT_OUTPUT_DIR = ROOT / "output" / "pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN = 19 * mm
RIGHT_MARGIN = 19 * mm
TOP_MARGIN = 22 * mm
BOTTOM_MARGIN = 20 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

INK = HexColor("#221B44")
MUTED = HexColor("#6F6A80")
PURPLE = HexColor("#8958F0")
BLUE = HexColor("#304B9D")
CYAN = HexColor("#10C4D8")
GOLD = HexColor("#FFC400")
PALE_BLUE = HexColor("#F1F5FF")
PALE_GREY = HexColor("#F7F7FA")
RULE = HexColor("#DDD9E8")
WHITE = colors.white

BODY_FONT = "WaveSans"
BOLD_FONT = "WaveSansBold"
MONO_FONT = "WaveMono"


@dataclass(frozen=True)
class RoleSpec:
    key: str
    language: str
    source_name: str
    output_name: str
    title: str
    subtitle: str
    audience: str
    accent: colors.Color
    toc_title: str
    audience_caption: str
    version_caption: str
    updated_caption: str
    page_caption: str
    manual_keyword: str


ROLE_SPECS: dict[str, RoleSpec] = {
    "member-zh-CN": RoleSpec(
        key="member",
        language="zh-CN",
        source_name="member-guide.zh-CN.md",
        output_name="wavesparks-member-user-manual-zh-CN.pdf",
        title="Member 快速上手手册",
        subtitle="从邀请邮件到开始参与的完整路径",
        audience="Member",
        accent=CYAN,
        toc_title="目录",
        audience_caption="适用角色",
        version_caption="版本",
        updated_caption="更新日期",
        page_caption="第 {number} 页",
        manual_keyword="使用手册",
    ),
    "mentor-zh-CN": RoleSpec(
        key="mentor",
        language="zh-CN",
        source_name="mentor-guide.zh-CN.md",
        output_name="wavesparks-mentor-user-manual-zh-CN.pdf",
        title="Mentor 快速上手手册",
        subtitle="从邀请邮件到处理首次导师请求",
        audience="Mentor",
        accent=GOLD,
        toc_title="目录",
        audience_caption="适用角色",
        version_caption="版本",
        updated_caption="更新日期",
        page_caption="第 {number} 页",
        manual_keyword="使用手册",
    ),
    "admin-zh-CN": RoleSpec(
        key="admin",
        language="zh-CN",
        source_name="admin-guide.zh-CN.md",
        output_name="wavesparks-admin-user-manual-zh-CN.pdf",
        title="Admin 管理者手册",
        subtitle="面向公司经理的社区管理与日常运营指南",
        audience="Admin",
        accent=PURPLE,
        toc_title="目录",
        audience_caption="适用角色",
        version_caption="版本",
        updated_caption="更新日期",
        page_caption="第 {number} 页",
        manual_keyword="管理者手册",
    ),
    "member-en": RoleSpec(
        key="member",
        language="en",
        source_name="member-guide.en.md",
        output_name="wavesparks-member-user-manual-en.pdf",
        title="WaveSparks Community Member Quick-start Kit",
        subtitle="From invitation email to active participation",
        audience="Member",
        accent=CYAN,
        toc_title="Contents",
        audience_caption="Audience",
        version_caption="Version",
        updated_caption="Updated",
        page_caption="Page {number}",
        manual_keyword="User manual",
    ),
    "mentor-en": RoleSpec(
        key="mentor",
        language="en",
        source_name="mentor-guide.en.md",
        output_name="wavesparks-mentor-user-manual-en.pdf",
        title="WaveSparks Community Mentor Quick-start Kit",
        subtitle="From invitation email to the first mentoring request",
        audience="Mentor",
        accent=GOLD,
        toc_title="Contents",
        audience_caption="Audience",
        version_caption="Version",
        updated_caption="Updated",
        page_caption="Page {number}",
        manual_keyword="User manual",
    ),
    "admin-en": RoleSpec(
        key="admin",
        language="en",
        source_name="admin-guide.en.md",
        output_name="wavesparks-admin-user-manual-en.pdf",
        title="WaveSparks Community Admin Manager Guide",
        subtitle="Community administration and day-to-day operations for company managers",
        audience="Admin",
        accent=PURPLE,
        toc_title="Contents",
        audience_caption="Audience",
        version_caption="Version",
        updated_caption="Updated",
        page_caption="Page {number}",
        manual_keyword="Manager guide",
    ),
}


@dataclass
class BuildMetadata:
    role: RoleSpec
    title: str
    subtitle: str
    version: str
    build_date: str
    source: Path
    author: str = "WaveSparks Community"


@dataclass
class BuildContext:
    metadata: BuildMetadata
    styles: dict[str, ParagraphStyle]
    warnings: list[str] = field(default_factory=list)
    heading_count: int = 0


class ManualDocTemplate(BaseDocTemplate):
    """Document template with brand chrome, outline entries, and TOC events."""

    def __init__(self, filename: str, metadata: BuildMetadata, styles: dict[str, ParagraphStyle]):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT_MARGIN,
            rightMargin=RIGHT_MARGIN,
            topMargin=TOP_MARGIN,
            bottomMargin=BOTTOM_MARGIN,
            title=metadata.title,
            author=metadata.author,
            subject=metadata.subtitle,
            creator="WaveSparks Markdown PDF Builder (ReportLab)",
        )
        self.metadata = metadata
        self.manual_styles = styles
        self._heading_sequence = 0
        self._last_outline_level = -1

        frame = self._make_frame()
        self.addPageTemplates(
            [
                PageTemplate(
                    id="Manual",
                    frames=[frame],
                    onPage=self._draw_page,
                )
            ]
        )

    def _make_frame(self):
        from reportlab.platypus import Frame

        return Frame(
            LEFT_MARGIN,
            BOTTOM_MARGIN,
            CONTENT_WIDTH,
            PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )

    def beforeDocument(self) -> None:
        self._heading_sequence = 0
        self._last_outline_level = -1

    def _draw_page(self, canvas, doc) -> None:
        meta = self.metadata
        canvas.saveState()
        canvas.setTitle(meta.title)
        canvas.setAuthor(meta.author)
        canvas.setSubject(meta.subtitle)
        canvas.setCreator("WaveSparks Markdown PDF Builder (ReportLab)")
        canvas.setKeywords(
            f"WaveSparks, Community, {meta.role.audience}, {meta.role.manual_keyword}"
        )

        if doc.page == 1:
            canvas.setFillColor(INK)
            canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
            canvas.setFillColor(meta.role.accent)
            canvas.rect(0, PAGE_HEIGHT - 7 * mm, PAGE_WIDTH, 7 * mm, fill=1, stroke=0)
            canvas.setFillColor(PURPLE)
            canvas.circle(PAGE_WIDTH - 16 * mm, 19 * mm, 31 * mm, fill=1, stroke=0)
            canvas.setFillColor(meta.role.accent)
            canvas.circle(PAGE_WIDTH - 2 * mm, 6 * mm, 21 * mm, fill=1, stroke=0)
            canvas.setStrokeColor(HexColor("#4B426A"))
            canvas.setLineWidth(0.7)
            canvas.line(LEFT_MARGIN, 33 * mm, PAGE_WIDTH - RIGHT_MARGIN, 33 * mm)
        else:
            canvas.setFillColor(INK)
            canvas.rect(0, PAGE_HEIGHT - 3 * mm, PAGE_WIDTH, 3 * mm, fill=1, stroke=0)
            canvas.setFillColor(meta.role.accent)
            canvas.rect(0, PAGE_HEIGHT - 3 * mm, 51 * mm, 3 * mm, fill=1, stroke=0)

            canvas.setFont(BODY_FONT, 7.8)
            canvas.setFillColor(MUTED)
            header = _truncate(meta.title, 64)
            canvas.drawString(LEFT_MARGIN, PAGE_HEIGHT - 12 * mm, header)
            canvas.drawRightString(
                PAGE_WIDTH - RIGHT_MARGIN,
                PAGE_HEIGHT - 12 * mm,
                f"{meta.role.audience} · {meta.version}",
            )

            canvas.setStrokeColor(RULE)
            canvas.setLineWidth(0.45)
            canvas.line(LEFT_MARGIN, 13 * mm, PAGE_WIDTH - RIGHT_MARGIN, 13 * mm)
            canvas.setFont(BODY_FONT, 7.6)
            canvas.setFillColor(MUTED)
            canvas.drawString(LEFT_MARGIN, 8.2 * mm, "WaveSparks Community")
            canvas.drawRightString(
                PAGE_WIDTH - RIGHT_MARGIN,
                8.2 * mm,
                meta.role.page_caption.format(number=doc.page - 1),
            )
        canvas.restoreState()

    def afterFlowable(self, flowable: Flowable) -> None:
        style_name = getattr(getattr(flowable, "style", None), "name", "")
        heading_levels = {
            "ManualHeading1": 0,
            "ManualHeading2": 1,
            "ManualHeading3": 2,
        }
        if style_name not in heading_levels or not isinstance(flowable, Paragraph):
            return

        text = flowable.getPlainText().strip()
        if not text:
            return
        requested_level = heading_levels[style_name]
        outline_level = min(requested_level, self._last_outline_level + 1)
        outline_level = max(0, outline_level)
        self._last_outline_level = outline_level
        self._heading_sequence += 1
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
        key = f"heading-{self._heading_sequence}-{digest}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=outline_level, closed=False)
        # Cover is intentionally unnumbered, so printed page numbers are page - 1.
        self.notify("TOCEntry", (requested_level, text, self.page - 1, key))


class ImageWithCaption(KeepTogether):
    """Semantic wrapper used only to keep an image close to its caption."""


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[: max_chars - 1].rstrip() + "…"


def _register_fonts() -> tuple[str, str]:
    """Register an embedded CJK font when possible, with a CID fallback."""

    global BODY_FONT, BOLD_FONT, MONO_FONT

    regular_candidates: Sequence[tuple[str, int]] = (
        ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0),
        ("/System/Library/Fonts/PingFang.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf", 0),
        ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 0),
    )
    bold_candidates: Sequence[tuple[str, int]] = (
        ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
        ("/System/Library/Fonts/PingFang.ttc", 5),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf", 0),
    )

    regular = next(((Path(p), idx) for p, idx in regular_candidates if Path(p).exists()), None)
    bold = next(((Path(p), idx) for p, idx in bold_candidates if Path(p).exists()), None)

    if regular is None:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        BODY_FONT = "STSong-Light"
        BOLD_FONT = "STSong-Light"
        MONO_FONT = "STSong-Light"
        return BODY_FONT, BOLD_FONT

    regular_path, regular_index = regular
    pdfmetrics.registerFont(
        TTFont(BODY_FONT, str(regular_path), subfontIndex=regular_index)
    )
    try:
        if bold is None:
            raise FileNotFoundError
        bold_path, bold_index = bold
        pdfmetrics.registerFont(TTFont(BOLD_FONT, str(bold_path), subfontIndex=bold_index))
    except Exception:
        # Mapping the same face still lets ReportLab honor <b> consistently.
        pdfmetrics.registerFont(
            TTFont(BOLD_FONT, str(regular_path), subfontIndex=regular_index)
        )

    # Use the Unicode face for code because manuals can contain Chinese comments.
    pdfmetrics.registerFont(
        TTFont(MONO_FONT, str(regular_path), subfontIndex=regular_index)
    )
    addMapping(BODY_FONT, 0, 0, BODY_FONT)
    addMapping(BODY_FONT, 1, 0, BOLD_FONT)
    addMapping(BODY_FONT, 0, 1, BODY_FONT)
    addMapping(BODY_FONT, 1, 1, BOLD_FONT)
    return BODY_FONT, BOLD_FONT


def _build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle(
        "ManualBody",
        parent=base["BodyText"],
        fontName=BODY_FONT,
        fontSize=9.6,
        leading=15.2,
        textColor=INK,
        alignment=TA_LEFT,
        wordWrap="CJK",
        splitLongWords=True,
        spaceAfter=6.5,
        allowWidows=0,
        allowOrphans=0,
    )
    return {
        "body": body,
        "small": ParagraphStyle(
            "ManualSmall",
            parent=body,
            fontSize=8.2,
            leading=12.3,
            textColor=MUTED,
        ),
        "caption": ParagraphStyle(
            "ManualCaption",
            parent=body,
            fontSize=7.8,
            leading=11.2,
            alignment=TA_CENTER,
            textColor=MUTED,
            spaceBefore=4,
            spaceAfter=12,
        ),
        "h1": ParagraphStyle(
            "ManualHeading1",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=21,
            leading=27,
            textColor=INK,
            spaceBefore=13,
            spaceAfter=10,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "ManualHeading2",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=15,
            leading=21,
            textColor=BLUE,
            spaceBefore=12,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "ManualHeading3",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=12.2,
            leading=17,
            textColor=INK,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "h4": ParagraphStyle(
            "ManualHeading4",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=10.5,
            leading=15,
            textColor=PURPLE,
            spaceBefore=7,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "list": ParagraphStyle(
            "ManualList",
            parent=body,
            leftIndent=14,
            firstLineIndent=-14,
            spaceAfter=3.2,
        ),
        "quote": ParagraphStyle(
            "ManualQuote",
            parent=body,
            fontSize=9.2,
            leading=14.2,
            textColor=BLUE,
            spaceAfter=0,
        ),
        "code": ParagraphStyle(
            "ManualCode",
            parent=body,
            fontName=MONO_FONT,
            fontSize=7.7,
            leading=11.4,
            textColor=INK,
            leftIndent=0,
            rightIndent=0,
            spaceAfter=0,
            splitLongWords=True,
            wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "ManualTableHead",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=7.8,
            leading=11.2,
            textColor=WHITE,
            spaceAfter=0,
        ),
        "table_cell": ParagraphStyle(
            "ManualTableCell",
            parent=body,
            fontSize=7.7,
            leading=11.2,
            spaceAfter=0,
        ),
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=10,
            leading=14,
            textColor=WHITE,
            spaceAfter=12,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=29,
            leading=38,
            textColor=WHITE,
            spaceAfter=18,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=body,
            fontSize=14,
            leading=21,
            textColor=HexColor("#D9D4E8"),
            spaceAfter=12,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=body,
            fontSize=9,
            leading=15,
            textColor=HexColor("#C8C2D9"),
        ),
        "toc_title": ParagraphStyle(
            "TocTitle",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=21,
            leading=27,
            textColor=INK,
            spaceAfter=14,
        ),
        "toc0": ParagraphStyle(
            "TocLevel0",
            parent=body,
            fontName=BOLD_FONT,
            fontSize=10,
            leading=15,
            textColor=INK,
            leftIndent=0,
            firstLineIndent=0,
            spaceBefore=4,
        ),
        "toc1": ParagraphStyle(
            "TocLevel1",
            parent=body,
            fontSize=8.6,
            leading=13,
            textColor=BLUE,
            leftIndent=13,
            firstLineIndent=0,
            spaceBefore=1,
        ),
        "toc2": ParagraphStyle(
            "TocLevel2",
            parent=body,
            fontSize=8,
            leading=12,
            textColor=MUTED,
            leftIndent=26,
            firstLineIndent=0,
            spaceBefore=0,
        ),
    }


def _split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    closing = text.find("\n---\n", 4)
    if closing < 0:
        return {}, text
    values: dict[str, str] = {}
    for raw_line in text[4:closing].splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        values[key.strip().lower()] = value.strip().strip("\"'")
    return values, text[closing + 5 :]


def _declared_version(text: str) -> str | None:
    """Read the human-facing Version/版本 line used by the manuals."""

    for line in text.splitlines()[:16]:
        match = re.match(r"^(?:Version|版本)\s*[:：]\s*([^|\s]+)", line.strip())
        if match:
            return match.group(1).strip()
    return None


def _plain_markdown(value: str) -> str:
    value = re.sub(r"!\[([^]]*)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[*_~`]", "", value)
    return html.unescape(value).strip()


def _inline_markdown(value: str) -> str:
    """Convert safe inline Markdown to the subset supported by Paragraph."""

    tokens: list[str] = []

    def stash(markup: str) -> str:
        token = f"WAVETOKEN{len(tokens):04d}END"
        tokens.append(markup)
        return token

    # Work from raw input so URL attributes and visible text are escaped separately.
    def code_repl(match: re.Match[str]) -> str:
        code = html.escape(match.group(1), quote=False)
        return stash(
            f'<font name="{MONO_FONT}" color="#221B44" backColor="#F1EFF7">{code}</font>'
        )

    value = re.sub(r"`([^`\n]+)`", code_repl, value)

    def link_repl(match: re.Match[str]) -> str:
        label = html.escape(match.group(1), quote=False)
        href = html.escape(match.group(2).strip(), quote=True)
        return stash(f'<link href="{href}" color="#304B9D"><u>{label}</u></link>')

    value = re.sub(
        r'(?<!!)\[([^]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)',
        link_repl,
        value,
    )
    value = html.escape(value, quote=False)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"__(.+?)__", r"<b>\1</b>", value)
    value = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", value)
    value = re.sub(r"(?<!_)_([^_\n]+)_(?!_)", r"<i>\1</i>", value)
    value = re.sub(r"~~(.+?)~~", r"<strike>\1</strike>", value)
    value = value.replace("[x]", "☑").replace("[X]", "☑").replace("[ ]", "☐")
    for index, markup in enumerate(tokens):
        value = value.replace(f"WAVETOKEN{index:04d}END", markup)
    return value


def _paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    normalized = re.sub(r"\s*\n\s*", " ", text.strip())
    return Paragraph(_inline_markdown(normalized), style)


def _cover_story(context: BuildContext) -> list[Flowable]:
    meta = context.metadata
    return [
        Spacer(1, 38 * mm),
        Paragraph("WAVESPARKS COMMUNITY", context.styles["cover_kicker"]),
        Paragraph(html.escape(meta.title), context.styles["cover_title"]),
        Paragraph(html.escape(meta.subtitle), context.styles["cover_subtitle"]),
        Spacer(1, 21 * mm),
        HRFlowable(width="38%", thickness=2, color=meta.role.accent, hAlign="LEFT"),
        Spacer(1, 8 * mm),
        Paragraph(
            f"{html.escape(meta.role.audience_caption)}: "
            f"{html.escape(meta.role.audience)}<br/>"
            f"{html.escape(meta.role.version_caption)}: "
            f"{html.escape(meta.version)}<br/>"
            f"{html.escape(meta.role.updated_caption)}: "
            f"{html.escape(meta.build_date)}",
            context.styles["cover_meta"],
        ),
        PageBreak(),
    ]


def _toc_story(context: BuildContext) -> list[Flowable]:
    toc = TableOfContents()
    toc.levelStyles = [
        context.styles["toc0"],
        context.styles["toc1"],
        context.styles["toc2"],
    ]
    toc.dotsMinLevel = 0
    return [
        Paragraph(html.escape(context.metadata.role.toc_title), context.styles["toc_title"]),
        HRFlowable(width="100%", thickness=0.8, color=RULE, spaceAfter=10),
        toc,
        PageBreak(),
    ]


def _is_table_separator(line: str) -> bool:
    stripped = line.strip().strip("|").strip()
    if "|" not in stripped:
        return False
    cells = [cell.strip() for cell in stripped.split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells)


def _split_table_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    # Manual tables do not require escaped pipes; retain a predictable parser.
    return [cell.strip() for cell in line.split("|")]


def _table_flowable(rows: list[list[str]], context: BuildContext) -> Flowable:
    col_count = max(len(row) for row in rows)
    normalized = [row + [""] * (col_count - len(row)) for row in rows]
    max_lengths = []
    for column in range(col_count):
        max_lengths.append(
            min(36, max(6, max(len(_plain_markdown(row[column])) for row in normalized)))
        )
    total = sum(max_lengths) or col_count
    widths = [CONTENT_WIDTH * length / total for length in max_lengths]

    data: list[list[Paragraph]] = []
    for row_index, row in enumerate(normalized):
        style = context.styles["table_head" if row_index == 0 else "table_cell"]
        data.append([Paragraph(_inline_markdown(cell), style) for cell in row])

    table = LongTable(
        data,
        colWidths=widths,
        repeatRows=1,
        hAlign="LEFT",
        splitByRow=1,
        spaceBefore=5,
        spaceAfter=11,
    )
    commands: list[tuple] = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for row_index in range(1, len(data)):
        commands.append(
            (
                "BACKGROUND",
                (0, row_index),
                (-1, row_index),
                WHITE if row_index % 2 else PALE_GREY,
            )
        )
    table.setStyle(TableStyle(commands))
    return table


def _quote_flowable(lines: list[str], context: BuildContext) -> Flowable:
    content = "<br/>".join(_inline_markdown(line.strip()) for line in lines)
    table = Table(
        [[Paragraph(content, context.styles["quote"])]],
        colWidths=[CONTENT_WIDTH],
        hAlign="LEFT",
        spaceBefore=4,
        spaceAfter=9,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
                ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _code_flowable(lines: list[str], language: str, context: BuildContext) -> Flowable:
    visible_lines: list[str] = []
    for raw in lines or [""]:
        expanded = raw.expandtabs(2)
        leading = len(expanded) - len(expanded.lstrip(" "))
        prefix = "&#160;" * leading
        visible_lines.append(prefix + html.escape(expanded.lstrip(" "), quote=False))
    code = "<br/>".join(visible_lines)
    label = html.escape(language.strip(), quote=False) if language.strip() else "CODE"
    label_style = ParagraphStyle(
        "CodeLabel",
        parent=context.styles["small"],
        fontName=BOLD_FONT,
        fontSize=6.7,
        leading=9,
        textColor=MUTED,
        spaceAfter=0,
    )
    table = Table(
        [
            [Paragraph(label.upper(), label_style)],
            [Paragraph(code, context.styles["code"])],
        ],
        colWidths=[CONTENT_WIDTH],
        hAlign="LEFT",
        spaceBefore=5,
        spaceAfter=11,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EAE7F1")),
                ("BACKGROUND", (0, 1), (-1, 1), PALE_GREY),
                ("BOX", (0, 0), (-1, -1), 0.45, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 4),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
                ("TOPPADDING", (0, 1), (-1, 1), 7),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _image_flowables(
    alt: str,
    raw_target: str,
    source_path: Path,
    context: BuildContext,
) -> list[Flowable]:
    is_english = context.metadata.role.language == "en"
    # Strip an optional Markdown image title: path "title".
    target = re.sub(r'\s+["\'][^"\']*["\']\s*$', "", raw_target.strip())
    if re.match(r"^https?://", target, flags=re.I):
        warning = f"remote image skipped (download it into the repo first): {target}"
        context.warnings.append(warning)
        label = "Image not embedded" if is_english else "图片未嵌入"
        return [_quote_flowable([f"{label}: {alt or target}"], context)]

    image_path = Path(target)
    if not image_path.is_absolute():
        image_path = (source_path.parent / image_path).resolve()
    if not image_path.is_file():
        context.warnings.append(f"image not found: {image_path}")
        label = "Image missing" if is_english else "图片缺失"
        return [_quote_flowable([f"{label}: {alt or target}"], context)]

    try:
        image = Image(str(image_path))
        max_width = CONTENT_WIDTH
        max_height = 112 * mm
        scale = min(max_width / image.imageWidth, max_height / image.imageHeight, 1.0)
        image.drawWidth = image.imageWidth * scale
        image.drawHeight = image.imageHeight * scale
        image.hAlign = "CENTER"
        image._restrictSize(max_width, max_height)
    except Exception as exc:
        context.warnings.append(f"cannot load image {image_path}: {exc}")
        label = "Image could not be loaded" if is_english else "图片无法读取"
        return [_quote_flowable([f"{label}: {alt or image_path.name}"], context)]

    caption = alt.strip() or image_path.stem.replace("-", " ")
    return [
        ImageWithCaption(
            [
                Spacer(1, 4),
                image,
                Paragraph(_inline_markdown(caption), context.styles["caption"]),
            ]
        )
    ]


def _parse_markdown(text: str, source_path: Path, context: BuildContext) -> list[Flowable]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    story: list[Flowable] = []
    index = 0
    skipped_first_h1 = False
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        story.append(_paragraph("\n".join(paragraph_lines), context.styles["body"]))
        paragraph_lines.clear()

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            index += 1
            continue

        fence = re.match(r"^\s*```\s*([^`]*)$", line)
        if fence:
            flush_paragraph()
            language = fence.group(1).strip()
            code_lines: list[str] = []
            index += 1
            while index < len(lines) and not re.match(r"^\s*```\s*$", lines[index]):
                code_lines.append(lines[index])
                index += 1
            if index >= len(lines):
                context.warnings.append(f"unclosed code fence in {source_path}")
            else:
                index += 1
            story.append(_code_flowable(code_lines, language, context))
            continue

        image_match = re.match(r"^\s*!\[([^]]*)\]\((.+)\)\s*$", line)
        if image_match:
            flush_paragraph()
            story.extend(
                _image_flowables(
                    image_match.group(1), image_match.group(2), source_path, context
                )
            )
            index += 1
            continue

        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            text_value = heading.group(2).strip()
            if level == 1 and not skipped_first_h1:
                skipped_first_h1 = True
                index += 1
                continue
            style_key = f"h{min(level, 4)}"
            story.append(Paragraph(_inline_markdown(text_value), context.styles[style_key]))
            index += 1
            continue

        if re.fullmatch(r"\s*(?:-{3,}|\*{3,}|_{3,})\s*", line):
            flush_paragraph()
            story.append(
                HRFlowable(
                    width="100%",
                    thickness=0.7,
                    color=RULE,
                    spaceBefore=7,
                    spaceAfter=9,
                )
            )
            index += 1
            continue

        if (
            "|" in line
            and index + 1 < len(lines)
            and _is_table_separator(lines[index + 1])
        ):
            flush_paragraph()
            rows = [_split_table_row(line)]
            index += 2  # delimiter is presentation syntax, not data
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                rows.append(_split_table_row(lines[index]))
                index += 1
            story.append(_table_flowable(rows, context))
            continue

        quote = re.match(r"^\s*>\s?(.*)$", line)
        if quote:
            flush_paragraph()
            quote_lines: list[str] = []
            while index < len(lines):
                quote_match = re.match(r"^\s*>\s?(.*)$", lines[index])
                if not quote_match:
                    break
                quote_lines.append(quote_match.group(1))
                index += 1
            story.append(_quote_flowable(quote_lines, context))
            continue

        list_match = re.match(r"^(\s*)([-+*]|\d+[.)])\s+(.+)$", line)
        if list_match:
            flush_paragraph()
            indent = min(5, len(list_match.group(1).expandtabs(2)) // 2)
            marker = list_match.group(2)
            bullet = "•" if marker in {"-", "+", "*"} else marker.rstrip(")")
            list_style = ParagraphStyle(
                f"ManualListDepth{indent}",
                parent=context.styles["list"],
                leftIndent=14 + indent * 13,
                firstLineIndent=-14,
            )
            story.append(
                Paragraph(
                    f'<font color="#8958F0"><b>{html.escape(bullet)}</b></font>'
                    f"&#160;&#160;{_inline_markdown(list_match.group(3))}",
                    list_style,
                )
            )
            index += 1
            continue

        if stripped in {"<!-- pagebreak -->", "<!-- page-break -->"}:
            flush_paragraph()
            story.append(PageBreak())
            index += 1
            continue

        # Ignore standalone HTML comments used as authoring notes.
        if stripped.startswith("<!--") and stripped.endswith("-->"):
            flush_paragraph()
            index += 1
            continue

        paragraph_lines.append(line)
        index += 1

    flush_paragraph()
    return story


def _resolve_source(input_dir: Path, spec: RoleSpec) -> Path:
    exact = input_dir / spec.source_name
    if exact.is_file():
        return exact
    candidates = sorted(input_dir.glob(f"*{spec.key}*.{spec.language}.md"))
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise FileNotFoundError(
            f"missing {spec.key} manual; expected {exact.relative_to(ROOT) if exact.is_relative_to(ROOT) else exact}"
        )
    raise RuntimeError(
        f"multiple candidate {spec.key} manuals found: "
        + ", ".join(str(path) for path in candidates)
    )


def _metadata_from_source(
    spec: RoleSpec,
    source: Path,
    front_matter: dict[str, str],
    markdown: str,
    build_date: str,
) -> BuildMetadata:
    return BuildMetadata(
        role=spec,
        title=front_matter.get("title") or spec.title,
        subtitle=front_matter.get("subtitle") or spec.subtitle,
        version=front_matter.get("version") or _declared_version(markdown) or "1.0",
        build_date=front_matter.get("date") or build_date,
        source=source,
        author=front_matter.get("author") or "WaveSparks Community",
    )


def build_manual(
    spec: RoleSpec,
    source: Path,
    destination: Path,
    build_date: str,
    strict: bool,
) -> list[str]:
    raw_text = source.read_text(encoding="utf-8")
    front_matter, markdown = _split_front_matter(raw_text)
    metadata = _metadata_from_source(spec, source, front_matter, markdown, build_date)
    styles = _build_styles()
    context = BuildContext(metadata=metadata, styles=styles)

    story: list[Flowable] = []
    story.extend(_cover_story(context))
    story.extend(_toc_story(context))
    story.extend(_parse_markdown(markdown, source, context))
    if len(story) <= 4:
        raise ValueError(f"manual has no renderable content: {source}")
    if strict and context.warnings:
        raise RuntimeError("; ".join(context.warnings))

    destination.parent.mkdir(parents=True, exist_ok=True)
    document = ManualDocTemplate(str(destination), metadata=metadata, styles=styles)
    document.multiBuild(story)
    return context.warnings


def _default_build_date() -> str:
    source_date_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if source_date_epoch:
        return datetime.fromtimestamp(int(source_date_epoch), tz=timezone.utc).date().isoformat()
    return date.today().isoformat()


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build WaveSparks Member, Mentor, and Admin PDF manuals.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help="directory containing the English and Chinese manual sources",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="directory for the six stable PDF artifacts",
    )
    parser.add_argument(
        "--roles",
        nargs="+",
        choices=("member", "mentor", "admin"),
        default=["member", "mentor", "admin"],
        help="manual roles to build",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        choices=("en", "zh-CN"),
        default=["en", "zh-CN"],
        help="manual languages to build",
    )
    parser.add_argument(
        "--date",
        default=_default_build_date(),
        help="ISO build date shown on covers (front matter can override it)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="fail the build on missing/unreadable/remote images or malformed fences",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        date.fromisoformat(args.date)
    except ValueError as exc:
        raise SystemExit(f"--date must be ISO YYYY-MM-DD, got: {args.date}") from exc

    _register_fonts()
    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    failures: list[str] = []
    built: list[Path] = []

    for language in args.languages:
        for role_key in args.roles:
            spec_key = f"{role_key}-{language}"
            spec = ROLE_SPECS[spec_key]
            try:
                source = _resolve_source(input_dir, spec)
                destination = output_dir / spec.output_name
                warnings = build_manual(
                    spec,
                    source=source,
                    destination=destination,
                    build_date=args.date,
                    strict=args.strict,
                )
                built.append(destination)
                print(f"built {role_key} ({language}): {destination}")
                for warning in warnings:
                    print(
                        f"warning ({role_key}, {language}): {warning}",
                        file=sys.stderr,
                    )
            except Exception as exc:
                failures.append(f"{role_key} ({language}): {exc}")

    if failures:
        for failure in failures:
            print(f"error: {failure}", file=sys.stderr)
        return 1
    print(f"completed: {len(built)} PDF manual(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
