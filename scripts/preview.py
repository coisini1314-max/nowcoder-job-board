"""Build a standalone offline dashboard, optionally with a private profile."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def json_element(name, path):
    data = path.read_text(encoding="utf-8").replace("<", "\\u003c")
    return f'<script type="application/json" id="{name}">{data}</script>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--profile", type=Path)
    args = parser.parse_args()
    markup = (SITE / "index.html").read_text()
    css = (SITE / "style.css").read_text()
    js = (SITE / "board.js").read_text()
    data = [json_element(name, SITE / (name + ".json")) for name in ("jobs", "keywords")]
    if args.profile:
        data.append(json_element("local-profile", args.profile))
    markup = markup.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
    markup = markup.replace('<script defer src="board.js"></script>', "")
    markup = markup.replace("</body>", "\n".join(data + [f"<script>{js}</script>", "</body>"]))
    args.output.write_text(markup, encoding="utf-8")
    if args.profile:
        args.output.chmod(0o600)


if __name__ == "__main__":
    main()
