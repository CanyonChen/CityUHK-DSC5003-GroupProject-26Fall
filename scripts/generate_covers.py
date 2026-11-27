"""Generate the eight SVG production covers used by the user-facing site.

Run from the repository root:  python scripts/generate_covers.py
Output: web-user/public/media/*.svg and web-admin/public/media/*.svg
"""
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]

SHOWS = [
    {
        "file": "thunderstorm-cover.svg",
        "title": ["Thunderstorm"],
        "kicker": "DSC DRAMA SOCIETY",
        "accent": "#C9A227",
        "motif": "storm",
    },
    {
        "file": "city-sound-cover.svg",
        "title": ["City Sound", "String Quartet"],
        "kicker": "CHAMBER MUSIC",
        "accent": "#7FA6C9",
        "motif": "strings",
    },
    {
        "file": "four-seasons-cover.svg",
        "title": ["Four", "Seasons"],
        "kicker": "CONTEMPORARY DANCE",
        "accent": "#D08A5A",
        "motif": "seasons",
    },
    {
        "file": "late-night-comedy-cover.svg",
        "title": ["Late Night", "Comedy"],
        "kicker": "STAND-UP · LIVE",
        "accent": "#E0B84C",
        "motif": "spotlight",
    },
    {
        "file": "jazz-night-cover.svg",
        "title": ["Jazz in the", "Black Box"],
        "kicker": "LIVE QUINTET",
        "accent": "#C97B4E",
        "motif": "waves",
    },
    {
        "file": "little-star-cover.svg",
        "title": ["The Little", "Star"],
        "kicker": "FAMILY THEATRE",
        "accent": "#E6CF7E",
        "motif": "stars",
    },
    {
        "file": "opera-gala-cover.svg",
        "title": ["La Traviata", "Highlights"],
        "kicker": "OPERA GALA",
        "accent": "#B45B5B",
        "motif": "curtain",
    },
    {
        "file": "light-showcase-cover.svg",
        "title": ["Light", "Showcase"],
        "kicker": "NEW MEDIA · INSTALLATION",
        "accent": "#79C0B4",
        "motif": "prism",
    },
]


def motif(kind: str, accent: str) -> str:
    if kind == "storm":
        return f"""
  <g opacity=".9">
    <path d="M1120 70 L980 400 L1090 385 L930 760 L1240 350 L1120 370 L1260 70 Z" fill="{accent}" opacity=".16"/>
    <path d="M1120 120 L1010 390 L1100 380 L975 690 L1200 360 L1115 375 L1225 120 Z" fill="{accent}" opacity=".55"/>
    <g stroke="#F7F5F0" stroke-width="2" opacity=".18">
      <path d="M820 120 L760 330"/><path d="M880 90 L820 300"/><path d="M950 140 L890 350"/>
      <path d="M700 160 L640 370"/><path d="M620 100 L560 310"/><path d="M540 180 L480 390"/>
    </g>
    <ellipse cx="820" cy="560" rx="640" ry="40" fill="#000" opacity=".22"/>
  </g>"""
    if kind == "strings":
        return f"""
  <g opacity=".9">
    <g fill="none" stroke="{accent}" stroke-width="2" opacity=".55">
      <circle cx="1110" cy="330" r="250"/><circle cx="1110" cy="330" r="190"/><circle cx="1110" cy="330" r="130"/>
    </g>
    <g stroke="#F7F5F0" stroke-width="3" opacity=".55">
      <path d="M980 90 L980 640"/><path d="M1040 70 L1040 660"/><path d="M1100 60 L1100 670"/>
      <path d="M1160 70 L1160 660"/><path d="M1220 90 L1220 640"/>
    </g>
    <g fill="{accent}" opacity=".9">
      <circle cx="980" cy="640" r="13"/><circle cx="1040" cy="660" r="13"/><circle cx="1100" cy="670" r="13"/>
      <circle cx="1160" cy="660" r="13"/><circle cx="1220" cy="640" r="13"/>
    </g>
    <path d="M760 720 C880 620 1010 780 1290 640" fill="none" stroke="#F7F5F0" stroke-width="1.5" opacity=".25"/>
  </g>"""
    if kind == "seasons":
        circles = ""
        for i, (cx, cy, col) in enumerate([
            (960, 260, "#8FBF9F"), (1110, 380, "#E0B84C"), (1010, 540, "#D08A5A"), (850, 430, "#7FA6C9")
        ]):
            circles += f'<circle cx="{cx}" cy="{cy}" r="{118 - i * 12}" fill="{col}" opacity=".{52 + i * 8}"/>'
        return f"""
  <g opacity=".92">
    {circles}
    <path d="M690 730 C840 640 1000 700 1300 560" fill="none" stroke="#F7F5F0" stroke-width="2" opacity=".28"/>
    <path d="M690 760 C860 680 1030 730 1320 610" fill="none" stroke="{accent}" stroke-width="2" opacity=".5"/>
  </g>"""
    if kind == "spotlight":
        return f"""
  <g opacity=".9">
    <path d="M860 700 L1040 60 L1140 60 L1010 700 Z" fill="{accent}" opacity=".14"/>
    <path d="M980 700 L1150 60 L1210 60 L1080 700 Z" fill="{accent}" opacity=".1"/>
    <path d="M1100 700 L1270 60 L1320 60 L1200 700 Z" fill="{accent}" opacity=".07"/>
    <ellipse cx="1080" cy="700" rx="260" ry="56" fill="{accent}" opacity=".28"/>
    <g fill="#F7F5F0" opacity=".5">
      <circle cx="880" cy="200" r="4"/><circle cx="960" cy="300" r="3"/><circle cx="1280" cy="180" r="5"/>
      <circle cx="1180" cy="260" r="3"/><circle cx="780" cy="360" r="3"/><circle cx="1320" cy="420" r="2"/>
    </g>
  </g>"""
    if kind == "waves":
        return f"""
  <g opacity=".92">
    <g fill="none" stroke="{accent}" stroke-width="3" opacity=".55">
      <path d="M700 220 C790 140 880 300 970 220 C1060 140 1150 300 1240 220 C1330 140 1420 300 1510 220"/>
      <path d="M700 320 C790 240 880 400 970 320 C1060 240 1150 400 1240 320 C1330 240 1420 400 1510 320"/>
      <path d="M700 420 C790 340 880 500 970 420 C1060 340 1150 500 1240 420 C1330 340 1420 500 1510 420"/>
    </g>
    <circle cx="1120" cy="600" r="150" fill="none" stroke="#F7F5F0" stroke-width="1.5" opacity=".3"/>
    <circle cx="1120" cy="600" r="8" fill="{accent}"/>
    <g fill="#F7F5F0" opacity=".45">
      <circle cx="860" cy="620" r="3"/><circle cx="930" cy="660" r="2"/><circle cx="1260" cy="560" r="4"/>
    </g>
  </g>"""
    if kind == "stars":
        stars = ""
        for x, y, r, o in [(1000, 150, 3, .7), (1120, 230, 2, .5), (1210, 120, 4, .8), (1320, 260, 2, .4),
                           (900, 250, 2, .5), (1420, 380, 3, .55), (1060, 340, 2, .4), (880, 420, 3, .35)]:
            stars += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#F7F5F0" opacity="{o}"/>'
        return f"""
  <g opacity=".95">
    <path d="M1090 620 L1140 470 L1190 620 L1340 670 L1190 720 L1140 870 L1090 720 L940 670 L1090 620 Z" fill="{accent}" opacity=".85"/>
    <path d="M1090 660 L1130 550 L1170 660 L1280 700 L1170 740 L1130 850 L1090 740 L980 700 L1090 660 Z" fill="#F7F5F0" opacity=".18"/>
    {stars}
    <ellipse cx="1140" cy="880" rx="260" ry="30" fill="{accent}" opacity=".18"/>
  </g>"""
    if kind == "curtain":
        folds = ""
        for i in range(9):
            x = 820 + i * 82
            folds += f'<path d="M{x} 0 C{x + 26} 260 {x - 18} 520 {x + 10} 900" stroke="#F7F5F0" stroke-width="1" opacity=".18" fill="none"/>'
        return f"""
  <g opacity=".9">
    <path d="M800 0 L1450 0 L1450 900 L800 900 Z" fill="#5E1F24" opacity=".55"/>
    {folds}
    <g opacity=".9">
      <path d="M1080 130 L1120 300 L1240 300 L1140 390 L1180 560 L1080 470 L980 560 L1020 390 L920 300 L1040 300 Z" fill="{accent}" opacity=".75"/>
      <circle cx="1080" cy="650" r="6" fill="#F7F5F0" opacity=".6"/>
    </g>
    <path d="M820 0 C860 300 830 600 860 900" stroke="{accent}" stroke-width="3" fill="none" opacity=".5"/>
  </g>"""
    if kind == "prism":
        return f"""
  <g opacity=".9">
    <path d="M820 650 L1080 90 L1340 650 Z" fill="none" stroke="{accent}" stroke-width="2" opacity=".7"/>
    <path d="M900 650 L1080 220 L1260 650 Z" fill="{accent}" opacity=".08"/>
    <g opacity=".6">
      <path d="M1080 200 L730 820" stroke="#7FA6C9" stroke-width="18" opacity=".3"/>
      <path d="M1080 200 L910 830" stroke="#E0B84C" stroke-width="14" opacity=".3"/>
      <path d="M1080 200 L1100 840" stroke="#8FBF9F" stroke-width="16" opacity=".3"/>
      <path d="M1080 200 L1280 830" stroke="#B45B5B" stroke-width="12" opacity=".3"/>
      <path d="M1080 200 L1470 800" stroke="#7FA6C9" stroke-width="10" opacity=".25"/>
    </g>
    <g stroke="#F7F5F0" stroke-width="1" opacity=".3">
      <path d="M620 760 L1500 760"/><path d="M620 790 L1500 790"/>
    </g>
  </g>"""
    return ""


def build(show):
    title_lines = "".join(
        f'<tspan x="90" dy="{i * 92 if i else 0}">{escape(line)}</tspan>'
        for i, line in enumerate(show["title"])
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="{escape(' '.join(show['title']))}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E1A30"/>
      <stop offset=".55" stop-color="#172A49"/>
      <stop offset="1" stop-color="#24395C"/>
    </linearGradient>
    <radialGradient id="glow" cx=".72" cy=".25" r=".7">
      <stop offset="0" stop-color="{show['accent']}" stop-opacity=".22"/>
      <stop offset="1" stop-color="{show['accent']}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B1526" stop-opacity="0"/>
      <stop offset="1" stop-color="#0B1526" stop-opacity=".82"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
  {motif(show['motif'], show['accent'])}
  <rect width="1600" height="900" fill="url(#fade)"/>
  <g font-family="Georgia, 'Times New Roman', serif" fill="#F7F5F0">
    <text x="90" y="640" font-size="96" letter-spacing="-2">{title_lines}</text>
  </g>
  <g font-family="'Segoe UI', Arial, sans-serif" fill="{show['accent']}">
    <text x="94" y="150" font-size="18" letter-spacing="6">{escape(show['kicker'])}</text>
    <text x="94" y="795" font-size="16" letter-spacing="4" fill="#F7F5F0" opacity=".65">CITYUHK EVENTS HUB · SEASON 2026</text>
  </g>
  <g stroke="{show['accent']}" fill="none">
    <path d="M94 185 L360 185" stroke-width="2" opacity=".7"/>
    <path d="M94 825 L1540 825" stroke-width="1" opacity=".32"/>
  </g>
</svg>
"""


def main():
    for show in SHOWS:
        cover = build(show)
        for app in ("web-user", "web-admin"):
            directory = ROOT / app / "public" / "media"
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / show["file"]
            path.write_text(cover, encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
