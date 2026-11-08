"""Refresh public job data from Nowcoder's server-rendered campus page."""
import argparse
from itertools import zip_longest
import html
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ORIGIN = "https://www.nowcoder.com"
SOURCE = ORIGIN + "/jobs/school/jobs"
AGENT = "CampusJobBoard/1.0"
LIMIT = 20
QUERIES = ("电商运营", "海外运营", "市场营销", "销售管培生", "广告投放")
ROOT = Path(__file__).resolve().parents[1]


def get(url):
    with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=25) as response:
        if urlparse(response.url).hostname != "www.nowcoder.com":
            raise ValueError("牛客将请求转到其他站点")
        body = response.read(6_000_001)
        if len(body) > 6_000_000:
            raise ValueError("牛客页面超过读取上限")
        return body.decode("utf-8")


def state(document):
    marker = re.search(r"window\.__INITIAL_STATE__\s*=\s*", document)
    if not marker:
        raise ValueError("牛客页面缺少公开岗位数据，可能需要人工检查")
    return json.JSONDecoder().raw_decode(document[marker.end():])[0]


def clean(value, limit=7000):
    return html.unescape(re.sub(r"<[^>]*>", " ", str(value or ""))).strip()[:limit]


def normalize(item):
    job = item.get("data") or item
    job_id = job.get("id")
    title = clean(job.get("jobName") or item.get("jobName"), 180)
    company = clean(item.get("companyNameText") or job.get("companyName"), 180)
    if not str(job_id).isdigit() or not title or not company:
        raise ValueError("岗位数据缺少 ID、标题或企业")
    ext = job.get("ext") or {}
    ext = json.loads(ext) if isinstance(ext, str) else ext
    locations = job.get("jobCityList") or [job.get("jobCity") or item.get("jobCity")]
    direct = item.get("rc_type") == 3010
    url = f"{ORIGIN}/jobs/detail/{job_id}" if direct else SOURCE
    cutoff = job.get("deliverEnd")
    return {
        "id": f"nowcoder:{job_id}",
        "company": company,
        "title": title,
        "cities": [clean(city, 40) for city in locations if city] or ["待核实"],
        "duties": clean(ext.get("infos")),
        "requirements": clean(ext.get("requirements")),
        "graduation": clean(job.get("graduationYear"), 50),
        "degree": {4000: "大专", 5000: "本科", 6000: "硕士", 7000: "博士"}.get(job.get("eduLevel"), ""),
        "deadline": datetime.fromtimestamp(cutoff / 1000, timezone.utc).isoformat() if isinstance(cutoff, int) and cutoff > 0 else None,
        "listed": job.get("status") == 0,
        "direct": direct,
        "url": url,
    }


def rows(document):
    page = state(document)
    listings = next((value["jobListData"] for value in page["app"].values()
                     if isinstance(value, dict) and isinstance(value.get("jobListData"), list)), [])
    return [normalize(row) for row in listings]


def collect(groups):
    jobs = {}
    for group in zip_longest(*groups):
        for job in group:
            if job:
                jobs.setdefault(job["id"], job)
            if len(jobs) == LIMIT:
                break
        if len(jobs) == LIMIT:
            break
    return list(jobs.values())


def fetch_jobs():
    robots = RobotFileParser()
    robots.parse(get(ORIGIN + "/robots.txt").splitlines())
    groups = []
    for keyword in QUERIES:
        url = SOURCE + "?" + urlencode({"search": keyword})
        if not robots.can_fetch(AGENT, url):
            raise ValueError("robots.txt 禁止访问校招职位页")
        time.sleep(1)
        group = rows(get(url))
        groups.append([job for job in group if job["direct"] and job["listed"]])
    jobs = collect(groups)
    if len(jobs) < LIMIT:
        if not robots.can_fetch(AGENT, SOURCE):
            raise ValueError("robots.txt 禁止访问校招职位页")
        time.sleep(1)
        fallback = rows(get(SOURCE))
        jobs = list({job["id"]: job for job in fallback + jobs}.values())
        priority = collect(groups)
        priority_ids = {job["id"] for job in priority}
        jobs = (priority + [job for job in jobs if job["id"] not in priority_ids])[:LIMIT]
    return jobs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, help="从已保存的公开页面重放抓取")
    args = parser.parse_args()
    jobs = collect([rows(args.html.read_text())]) if args.html else fetch_jobs()
    if len(jobs) != LIMIT or sum(bool(j["duties"] and j["requirements"]) for j in jobs) < 10:
        raise ValueError(f"仅获得 {len(jobs)} 条不同岗位或 JD 覆盖不足，保留上次快照")
    output = ROOT / "site" / "jobs.json"
    temporary = output.with_suffix(".tmp")
    snapshot = {"source": SOURCE, "queries": list(QUERIES) if not args.html else [], "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "jobs": jobs}
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"已更新 {len(jobs)} 个公开岗位，其中 {sum(bool(j['duties'] and j['requirements']) for j in jobs)} 个含职责和要求")


if __name__ == "__main__":
    main()
