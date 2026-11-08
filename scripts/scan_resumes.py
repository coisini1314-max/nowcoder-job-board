"""Extract private keyword profiles from selected PDF versions."""
import argparse
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]


def fold(value):
    return re.sub(r"\s+", "", value).lower()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--pattern", default="*_[0-9]*.pdf")
    parser.add_argument("--output", type=Path, default=ROOT / "private" / "profile.json")
    parser.add_argument("--year", required=True, type=int)
    parser.add_argument("--degree", required=True, choices=["大专", "本科", "硕士", "博士"])
    parser.add_argument("--focus", action="append", default=[], metavar="VERSION=KEYWORD")
    parser.add_argument("--preferred", default="", help="按顺序列出优先版本，用逗号分隔")
    args = parser.parse_args()
    try:
        directions = dict(item.split("=", 1) for item in args.focus)
    except ValueError:
        parser.error("--focus 需要 VERSION=KEYWORD 格式")
    terms = json.loads((ROOT / "site" / "keywords.json").read_text())
    versions = []
    for path in sorted(args.directory.glob(args.pattern)):
        version = path.stem.rsplit("_", 1)[-1]
        if not version.isdigit():
            continue
        with pdfplumber.open(path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        if not text.strip():
            raise ValueError(f"无法读取版本 {version}，可能需要 OCR")
        # Avoid treating coursework or a target job name as hands-on evidence.
        experience = re.split(r"实习经历|工作经历|项目经历", text, maxsplit=1)[-1]
        # The company name can contain a keyword without proving the underlying work.
        experience = "\n".join(line.rsplit("｜", 1)[-1] for line in experience.splitlines())
        folded = fold(experience)
        tags = [tag for tag, aliases in terms.items()
                if any(fold(alias) in folded for alias in aliases)]
        versions.append({
            "id": version, "file": path.name, "focus": directions.get(version, ""), "tags": tags,
        })
    if not versions:
        raise ValueError("没有找到可读的编号简历")
    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with args.output.open("w", encoding="utf-8") as handle:
        args.output.chmod(0o600)
        json.dump({"year": args.year, "degree": args.degree,
                   "preferred": [v.strip() for v in args.preferred.split(",") if v.strip()],
                   "versions": versions}, handle, ensure_ascii=False, indent=2)
    print(f"已生成 {len(versions)} 个版本的本地关键词档案")


if __name__ == "__main__":
    main()
