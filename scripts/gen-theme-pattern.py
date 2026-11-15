"""Generate the global theme-pattern CSS from line-in-motion.svg.

Rewrites fill to #ffffff so the tile works as a luminance/alpha mask in every
browser, strips the Sketch XML cruft, and URL-encodes it for use as a data URI.
"""

import re
import urllib.parse
from pathlib import Path

# Derived, never hardcoded: the repo moved and the original hand-supplied tile
# lived outside it (Downloads was wiped, taking the source with it). The copy
# under scripts/assets is the mask-normalised geometry recovered from the
# generated CSS, so re-running this is idempotent.
REPO = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "assets" / "line-in-motion.svg"
OUT = REPO / "app" / "src" / "styles" / "globalPattern.css"

svg = SRC.read_text(encoding="utf-8")

# Keep only the geometry: drop the XML prolog, the Sketch generator comment,
# the empty <defs>, and the wrapper <g> elements.
svg = re.sub(r"<\?xml[^>]*\?>", "", svg)
svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
svg = re.sub(r"<defs>\s*</defs>", "", svg)

# Both fills in the source live on <g> wrappers that we are about to remove
# (the outer one is fill="none", the inner carries the real colour). So rather
# than migrate the attribute, just set the fill we actually want on the <path>.
svg = re.sub(r"<g[^>]*>", "", svg)
svg = svg.replace("</g>", "")
svg = re.sub(r"\s+id=\"[^\"]*\"", "", svg)

# Mask luminance is driven by fill brightness: white reads as opaque, black as
# fully transparent. Painting the tile black would make the pattern vanish.
svg = re.sub(
    r"<path(?![^>]*\sfill=)",
    '<path fill="#ffffff"',
    svg,
    count=1,
)
svg = re.sub(r"\s+", " ", svg).strip()

assert "#ffffff" in svg, "fill rewrite failed"
assert "<path" in svg, "geometry lost"

# Collapse the path data to the shortest safe encoding.
data = urllib.parse.quote(svg, safe="")

# Preview tile size; the source viewBox is 120x120.
CSS = f"""/*
 * Global theme pattern — line-in-motion
 *
 * One tile, every theme. The geometry comes from line-in-motion.svg (120x120
 * viewBox); only the colour varies, and that comes from the theme's own primary
 * token so each theme's pattern follows its own accent automatically.
 *
 * WHY A MASK: an SVG data URI cannot read a CSS custom property, so a plain
 * background-image would bake in one fixed colour. Painting the tile white and
 * using it as a mask lets background-color carry the accent instead, which is
 * what makes a single tile work across all seven themes.
 *
 * WHY --color-primary, NOT --theme-accent: the two carry DIFFERENT formats.
 * --theme-accent holds bare components ("15 65% 55%") and must be wrapped in
 * hsl(); --color-primary is already a finished colour ("hsl(348 68% 52%)").
 * A single hsl() wrapper therefore double-wraps one of them and resolves to
 * invalid -> fully transparent. --color-primary is defined by every theme
 * block and already tracks each theme's accent (the special themes set it to
 * hsl(var(--theme-primary)), which equals their accent), so it is the one
 * value that is correct everywhere with no wrapping.
 *
 * WHY WHITE FILL: CSS masks resolve luminance by default, where black means
 * transparent. The hand-supplied tile shipped fill="#000000", which would mask
 * the pattern to nothing, so the generator forces #ffffff on the path. The copy
 * kept in scripts/assets is already normalized, which is what makes a
 * regeneration byte-identical.
 *
 * PERF: fixed attachment is deliberately avoided — it repaints on scroll.
 * The tile is rasterised once and repeated by the compositor.
 */

:root {{
\t--pattern-tile: url("data:image/svg+xml,{data}");
\t--pattern-size: 120px 120px;
\t--pattern-opacity: 0.055;
\t--pattern-color: var(--color-primary, hsl(348 68% 55%));
}}

/*
 * Applied by AppBackground for every theme. Kept at low opacity so it reads as
 * texture in the background, never as content competing with the rose accent
 * or with foreground text.
 */
.gs-theme-pattern {{
\tposition: absolute;
\tinset: 0;
\tpointer-events: none;
\tbackground-color: var(--pattern-color);
\t-webkit-mask-image: var(--pattern-tile);
\tmask-image: var(--pattern-tile);
\t-webkit-mask-size: var(--pattern-size);
\tmask-size: var(--pattern-size);
\t-webkit-mask-repeat: repeat;
\tmask-repeat: repeat;
\topacity: var(--pattern-opacity);
}}
"""

OUT.write_text(CSS, encoding="utf-8", newline="\n")
print(f"wrote {OUT}")
print(f"  source      : {SRC.stat().st_size:,} bytes")
print(f"  tile (data) : {len(data):,} chars encoded")
print(f"  css out     : {OUT.stat().st_size:,} bytes")
print(f"  fill        : {'#ffffff (mask-safe)' if '#ffffff' in svg else 'MISSING'}")
print(f"  paths kept  : {svg.count('<path')}")
