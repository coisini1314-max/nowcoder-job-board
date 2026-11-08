"""Extract private keyword profiles from selected PDF versions."""
import argparse
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
DIRECTIONS = {
    "1": "电商运营", "11": "电商运营", "111": "电商运营",
    "2": "销售与拓客", "3": "市场营销", "33": "市场营销",
    "4": "广告投放", "5": "海外运营", "55": "海外运营", "555": "海外运营",
}


def fold(value):
    return re.sub(r"\s+", "", value).lower()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--pattern", default="*_[0-9]*.pdf")
    parser.add_argument("--output", type=Path, default=ROOT / "private" / "profile.json")
    args = parser.parse_args()
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
            "id": version, "file": path.name, "focus": DIRECTIONS.get(version, ""), "tags": tags,
        })
    if not versions:
        raise ValueError("没有找到可读的编号简历")
    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with args.output.open("w", encoding="utf-8") as handle:
        args.output.chmod(0o600)
        json.dump({"year": 2027, "degree": "硕士", "preferred": ["1", "2", "3", "4", "5"],
                   "versions": versions}, handle, ensure_ascii=False, indent=2)
    print(f"已生成 {len(versions)} 个版本的本地关键词档案")


if __name__ == "__main__":
    main()
