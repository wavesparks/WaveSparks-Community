#!/usr/bin/env python3
"""Generate the bilingual role flowcharts embedded in the PDF manuals."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs" / "assets" / "manuals"

WIDTH = 1600
HEIGHT = 900
BACKGROUND = "#F6F7FB"
INK = "#221B44"
MUTED = "#6F6A80"
LINE = "#D8D5E3"
WHITE = "#FFFFFF"
BLUE = "#304B9D"

REGULAR_FONT_CANDIDATES = (
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf"),
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
)
BOLD_FONT_CANDIDATES = (
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf"),
    Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
)


def first_available_font(candidates: tuple[Path, ...]) -> Path | None:
    return next((path for path in candidates if path.is_file()), None)


REGULAR_FONT = first_available_font(REGULAR_FONT_CANDIDATES)
BOLD_FONT = first_available_font(BOLD_FONT_CANDIDATES)


@dataclass(frozen=True)
class Step:
    title: str
    detail: str


@dataclass(frozen=True)
class Diagram:
    filename: str
    title: str
    subtitle: str
    role_label: str
    accent: str
    steps: tuple[Step, ...]


DIAGRAMS = (
    Diagram(
        "member-kickstart-flow-en.png",
        "Your first journey as a Member",
        "Follow the invitation link first. Access and profile completion come next.",
        "MEMBER QUICK-START",
        "#10AFC2",
        (
            Step("Receive the email", "Use your personal invitation only"),
            Step("Open it within 7 days", "Expired links must be resent"),
            Step("Sign in or sign up", "Use the exact invited email"),
            Step("Connect your account", "Finish the invitation handoff"),
            Step("Complete 7 profile items", "Unlock participation features"),
            Step("Choose a Space", "Main and Events are separate"),
            Step("Start participating", "Read, post, meet, and connect"),
        ),
    ),
    Diagram(
        "member-kickstart-flow-zh-CN.png",
        "Member 的首次使用路径",
        "先从邀请邮件进入，再完成账号连接和个人资料。",
        "MEMBER 快速上手",
        "#10AFC2",
        (
            Step("收到邀请邮件", "只使用发给你本人的链接"),
            Step("7 天内打开", "过期后请管理员重发"),
            Step("注册或登录", "必须使用受邀邮箱"),
            Step("连接账号", "完成邀请确认步骤"),
            Step("完成 7 项资料", "解锁互动功能"),
            Step("选择 Space", "主社区与活动彼此独立"),
            Step("开始参与", "阅读、发布、认识与连接"),
        ),
    ),
    Diagram(
        "member-match-intro-flow-en.png",
        "From matching to a real introduction",
        "Matching suggests fit. Contact details appear only after acceptance.",
        "MEMBER CONNECTION FLOW",
        "#10AFC2",
        (
            Step("Complete your profile", "Give matching enough context"),
            Step("Set intent per Space", "Add goals, needs, and offers"),
            Step("Review a match", "Treat the score as fit, not certainty"),
            Step("Request an introduction", "Add a clear reason and note"),
            Step("Wait for a response", "The other member decides"),
            Step("Connect after acceptance", "Continue outside WaveSparks"),
        ),
    ),
    Diagram(
        "member-match-intro-flow-zh-CN.png",
        "从匹配到真实联系",
        "匹配只代表契合度；对方接受后才会显示联系方式。",
        "MEMBER 连接流程",
        "#10AFC2",
        (
            Step("完善个人资料", "让系统获得足够背景"),
            Step("按 Space 设置意向", "填写目标、需求与可提供内容"),
            Step("查看匹配", "分数是契合度，不是成功概率"),
            Step("发起引荐", "说明原因并写清留言"),
            Step("等待对方回应", "由对方接受或拒绝"),
            Step("接受后联系", "后续沟通在平台外进行"),
        ),
    ),
    Diagram(
        "mentor-kickstart-flow-en.png",
        "Your first journey as a Mentor",
        "Member access, mentor approval, and Space access are separate checks.",
        "MENTOR QUICK-START",
        "#D29A00",
        (
            Step("Receive the email", "Open your personal invitation"),
            Step("Connect your account", "Use the exact invited email"),
            Step("Complete Member profile", "Finish all required profile items"),
            Step("Confirm approval", "Look for Approved mentor status"),
            Step("Add mentor details", "Topics, formats, and availability"),
            Step("Enable mentor matching", "Opt in and offer mentor match"),
            Step("Enter an allowed Space", "Serve only where you have access"),
        ),
    ),
    Diagram(
        "mentor-kickstart-flow-zh-CN.png",
        "Mentor 的首次使用路径",
        "成员权限、导师认证和 Space 权限是三项独立条件。",
        "MENTOR 快速上手",
        "#D29A00",
        (
            Step("收到邀请邮件", "打开你的个人邀请"),
            Step("连接账号", "使用完全一致的受邀邮箱"),
            Step("完成 Member 资料", "补齐全部必填资料"),
            Step("确认导师认证", "查看 Approved mentor 状态"),
            Step("填写导师信息", "主题、方式与时间安排"),
            Step("开启导师匹配", "选择加入并提供 mentor match"),
            Step("进入获准 Space", "只在有权限的空间提供支持"),
        ),
    ),
    Diagram(
        "mentor-request-flow-en.png",
        "Handle a mentoring request",
        "Review and decide in the source Space, then continue outside the platform.",
        "MENTOR REQUEST FLOW",
        "#D29A00",
        (
            Step("See the notification", "Use Mentoring for the overview"),
            Step("Open the source Space", "The request belongs to one Space"),
            Step("Read the purpose", "Review the member and their note"),
            Step("Accept or decline", "Respond clearly and promptly"),
            Step("Exchange contact details", "Visible only after acceptance"),
            Step("Arrange mentoring", "Schedule and work outside WaveSparks"),
        ),
    ),
    Diagram(
        "mentor-request-flow-zh-CN.png",
        "处理一次导师请求",
        "在请求所属 Space 中完成决定，接受后再到平台外继续。",
        "MENTOR 请求流程",
        "#D29A00",
        (
            Step("看到通知", "先在 Mentoring 查看总览"),
            Step("进入来源 Space", "每个请求只属于一个 Space"),
            Step("阅读请求目的", "查看成员资料与留言"),
            Step("接受或拒绝", "清晰并及时地回应"),
            Step("交换联系方式", "仅在接受后双方可见"),
            Step("安排导师沟通", "排期与辅导在平台外进行"),
        ),
    ),
    Diagram(
        "admin-event-launch-flow-en.png",
        "Launch and close an Event",
        "Use a draft for setup, test access, then choose the lifecycle state deliberately.",
        "ADMIN EVENT PLAYBOOK",
        "#8958F0",
        (
            Step("Review the dashboard", "Confirm the organization and timing"),
            Step("Create a draft Event", "Add name, dates, and description"),
            Step("Invite participants", "Add only the intended people"),
            Step("Check access", "Test with a participant account"),
            Step("Open the Event", "Set Upcoming or Active"),
            Step("Monitor activity", "Watch content, requests, and issues"),
            Step("End or archive", "Ended stays interactive; archive closes"),
        ),
    ),
    Diagram(
        "admin-event-launch-flow-zh-CN.png",
        "发布并结束一个 Event",
        "先在草稿中配置并测试权限，再有意识地选择生命周期状态。",
        "ADMIN 活动操作路径",
        "#8958F0",
        (
            Step("查看管理概览", "确认组织、时间与目标"),
            Step("创建草稿 Event", "填写名称、日期与介绍"),
            Step("邀请参与者", "只添加目标人员"),
            Step("检查访问权限", "使用参与者账号测试"),
            Step("开放 Event", "设置为 Upcoming 或 Active"),
            Step("关注运行情况", "查看内容、请求与异常"),
            Step("结束或归档", "Ended 仍可互动；Archive 才关闭"),
        ),
    ),
    Diagram(
        "admin-support-flow-en.png",
        "Resolve a member issue",
        "Start in the Admin console. Escalate only service or engineering problems.",
        "ADMIN SUPPORT PATH",
        "#8958F0",
        (
            Step("Identify the symptom", "Ask what the member was trying to do"),
            Step("Check the invitation", "Resend, revoke, or confirm expiry"),
            Step("Check account and Space", "Both must allow access"),
            Step("Check profile or content", "Guide the member or moderate"),
            Step("Retest the exact path", "See whether the fix worked"),
            Step("Close or escalate", "Close if fixed; send evidence if not"),
        ),
    ),
    Diagram(
        "admin-support-flow-zh-CN.png",
        "处理一次成员问题",
        "先在管理后台排查；只有服务或工程故障才交给技术负责人。",
        "ADMIN 支持路径",
        "#8958F0",
        (
            Step("确认问题现象", "询问成员当时想完成什么"),
            Step("检查邀请状态", "重发、撤销或确认是否过期"),
            Step("检查账号与 Space", "两项条件都必须允许访问"),
            Step("检查资料或内容", "指导成员或执行内容管理"),
            Step("复测同一路径", "检查问题是否已经解决"),
            Step("关闭或升级", "已解决就关闭；未解决则附证据升级"),
        ),
    ),
)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def text_width(draw: ImageDraw.ImageDraw, value: str, face: ImageFont.FreeTypeFont) -> float:
    box = draw.textbbox((0, 0), value, font=face)
    return box[2] - box[0]


def wrap_text(
    draw: ImageDraw.ImageDraw,
    value: str,
    face: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str]:
    if not value:
        return []
    tokens = value.split(" ") if " " in value else list(value)
    separator = " " if " " in value else ""
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = token if not current else f"{current}{separator}{token}"
        if current and text_width(draw, candidate, face) > max_width:
            lines.append(current)
            current = token
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def centered_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    box: tuple[int, int, int, int],
    face: ImageFont.FreeTypeFont,
    fill: str,
    spacing: int,
    y: int,
) -> int:
    left, _, right, _ = box
    line_height = face.size + spacing
    for line in lines:
        width = text_width(draw, line, face)
        draw.text(((left + right - width) / 2, y), line, font=face, fill=fill)
        y += line_height
    return y


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    color: str,
) -> None:
    draw.line((start, end), fill=color, width=9)
    ex, ey = end
    if abs(end[0] - start[0]) >= abs(end[1] - start[1]):
        direction = 1 if end[0] > start[0] else -1
        tip = [(ex, ey), (ex - 18 * direction, ey - 13), (ex - 18 * direction, ey + 13)]
    else:
        direction = 1 if end[1] > start[1] else -1
        tip = [(ex, ey), (ex - 13, ey - 18 * direction), (ex + 13, ey - 18 * direction)]
    draw.polygon(tip, fill=color)


def card_positions(count: int) -> list[tuple[int, int, int, int]]:
    top_count = 4 if count == 7 else 3
    bottom_count = count - top_count
    card_width = 316 if top_count == 4 else 370
    card_height = 190
    top_gap = (WIDTH - 2 * 70 - top_count * card_width) // max(1, top_count - 1)
    top = [
        (70 + index * (card_width + top_gap), 235, 70 + index * (card_width + top_gap) + card_width, 425)
        for index in range(top_count)
    ]
    bottom_width = 370
    bottom_total = bottom_count * bottom_width + max(0, bottom_count - 1) * 80
    bottom_left = (WIDTH - bottom_total) // 2
    bottom = [
        (bottom_left + index * (bottom_width + 80), 590, bottom_left + index * (bottom_width + 80) + bottom_width, 780)
        for index in range(bottom_count)
    ]
    return top + bottom


def render(diagram: Diagram) -> Path:
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    title_font = font(BOLD_FONT, 50)
    subtitle_font = font(REGULAR_FONT, 27)
    label_font = font(BOLD_FONT, 19)
    step_title_font = font(BOLD_FONT, 29)
    step_detail_font = font(REGULAR_FONT, 23)
    number_font = font(BOLD_FONT, 24)
    footer_font = font(REGULAR_FONT, 19)

    draw.rounded_rectangle((44, 34, WIDTH - 44, HEIGHT - 40), radius=34, fill=WHITE, outline="#E4E1EC", width=3)
    draw.rounded_rectangle((70, 62, 348, 104), radius=20, fill=diagram.accent)
    label_width = text_width(draw, diagram.role_label, label_font)
    draw.text(((70 + 348 - label_width) / 2, 69), diagram.role_label, font=label_font, fill=WHITE)
    draw.text((70, 119), diagram.title, font=title_font, fill=INK)
    draw.text((72, 167), diagram.subtitle, font=subtitle_font, fill=MUTED)

    positions = card_positions(len(diagram.steps))
    top_count = 4 if len(diagram.steps) == 7 else 3

    for index in range(top_count - 1):
        left = positions[index]
        right = positions[index + 1]
        draw_arrow(draw, (left[2] + 9, (left[1] + left[3]) // 2), (right[0] - 15, (right[1] + right[3]) // 2), LINE)

    if len(positions) > top_count:
        source = positions[top_count - 1]
        target = positions[top_count]
        bend_y = 510
        source_x = (source[0] + source[2]) // 2
        target_x = (target[0] + target[2]) // 2
        draw.line((source_x, source[3] + 7, source_x, bend_y), fill=LINE, width=9)
        draw.line((source_x, bend_y, target_x, bend_y), fill=LINE, width=9)
        draw_arrow(draw, (target_x, bend_y), (target_x, target[1] - 15), LINE)

    for index in range(top_count, len(positions) - 1):
        left = positions[index]
        right = positions[index + 1]
        draw_arrow(draw, (left[2] + 9, (left[1] + left[3]) // 2), (right[0] - 15, (right[1] + right[3]) // 2), LINE)

    for index, (step, box) in enumerate(zip(diagram.steps, positions), start=1):
        left, top, right, bottom = box
        draw.rounded_rectangle(box, radius=26, fill=WHITE, outline=diagram.accent, width=4)
        draw.ellipse((left + 18, top - 24, left + 76, top + 34), fill=diagram.accent)
        number = str(index)
        number_width = text_width(draw, number, number_font)
        draw.text((left + 47 - number_width / 2, top - 16), number, font=number_font, fill=WHITE)

        title_lines = wrap_text(draw, step.title, step_title_font, right - left - 48)
        detail_lines = wrap_text(draw, step.detail, step_detail_font, right - left - 52)
        y = top + 34
        y = centered_lines(draw, title_lines, box, step_title_font, INK, 7, y)
        y += 8
        centered_lines(draw, detail_lines, box, step_detail_font, MUTED, 6, y)

    footer = "WaveSparks Community  |  Quick-start journey"
    footer_width = text_width(draw, footer, footer_font)
    draw.text(((WIDTH - footer_width) / 2, 832), footer, font=footer_font, fill=BLUE)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / diagram.filename
    canvas.save(destination, format="PNG", optimize=True)
    return destination


def main() -> None:
    if REGULAR_FONT is None or BOLD_FONT is None:
        raise SystemExit(
            "A Unicode CJK font is required; install Noto Sans CJK or use a supported macOS font"
        )
    for diagram in DIAGRAMS:
        destination = render(diagram)
        print(destination.relative_to(ROOT))


if __name__ == "__main__":
    main()
