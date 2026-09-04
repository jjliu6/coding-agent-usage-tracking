#!/usr/bin/env python3
"""One-shot generator for docs/og-image.png (1200x630 social card).

X / Facebook / Slack refuse cards whose og:image is smaller than ~144px
(and look poor below 1200x630). The landing page used to point og:image
at icon-128.png, so Twitterbot dropped the preview entirely.

This is not part of `npm test` or the Pages deploy — run it when the
icon or panel screenshot changes:

    python3 scripts/build-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = DOCS / "og-image.png"

W, H = 1200, 630
BG = (15, 17, 22)
FG = (236, 239, 244)
MUTED = (163, 171, 185)
ACCENT = (79, 209, 168)
CHIP_BG = (38, 43, 53)
BANNER = (10, 12, 16)

FONT_DIR = Path("/usr/share/fonts/truetype/macos")


def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / name), size)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def main():
    canvas = Image.new("RGBA", (W, H), BG + (255,))

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((-200, 40, 460, 680), fill=(31, 157, 124, 55))
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))

    icon = Image.open(DOCS / "icon-128.png").convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
    icon = rounded(icon, 24)
    canvas.paste(icon, (72, 72), icon)

    draw = ImageDraw.Draw(canvas)
    title = font("Inter-Bold.ttf", 44)
    tag = font("Inter-SemiBold.ttf", 24)
    body = font("Inter-Medium.ttf", 20)
    chip_font = font("Inter-SemiBold.ttf", 17)
    foot = font("Inter-Medium.ttf", 16)

    draw.text((188, 78), "Coding Agents Usage", font=title, fill=FG)
    draw.text((188, 134), "Your AI coding quota, at a glance.", font=tag, fill=ACCENT)

    draw.multiline_text(
        (72, 210),
        "Free Chrome extension — remaining usage for Claude Code,\n"
        "Codex, Cursor, Grok and Gemini in one side panel.",
        font=body,
        fill=MUTED,
        spacing=8,
    )

    chips = [
        ("Claude Code", (217, 119, 87)),
        ("Codex", (92, 214, 179)),
        ("Grok", (183, 140, 240)),
        ("Cursor", (110, 155, 245)),
        ("Grok Bot", (244, 154, 193)),
        ("Gemini", (59, 120, 231)),
    ]
    x, y = 72, 310
    for name, color in chips:
        tw = draw.textlength(name, font=chip_font)
        w, h = tw + 44, 36
        if x + w > 680:
            x = 72
            y += 48
        draw.rounded_rectangle((x, y, x + w, y + h), 18, fill=CHIP_BG)
        draw.ellipse((x + 12, y + 13, x + 22, y + 23), fill=color)
        draw.text((x + 30, y + 7), name, font=chip_font, fill=FG)
        x += w + 10

    shot = Image.open(DOCS / "shot-panel-en.png").convert("RGBA")
    target_w = 390
    scale = target_w / shot.width
    shot = shot.resize((target_w, int(shot.height * scale)), Image.Resampling.LANCZOS)
    shot = shot.crop((0, 0, shot.width, 530))
    shot = rounded(shot, 20)

    sx, sy = 760, 36
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (sx + 10, sy + 18, sx + shot.width + 10, sy + shot.height + 18),
        20,
        fill=(0, 0, 0, 150),
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    canvas.paste(shot, (sx, sy), shot)

    draw.rectangle((0, H - 48, W, H), fill=BANNER)
    draw.text(
        (72, H - 34),
        "token-tracking.philosophie.ai   ·   Free  ·  Open source  ·  No account",
        font=foot,
        fill=MUTED,
    )

    rgb = canvas.convert("RGB")
    rgb.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {rgb.size[0]}x{rgb.size[1]} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
