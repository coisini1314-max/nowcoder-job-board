"use strict";
const STATUS = ["未投递", "已投递", "跳过", "失败"];
const THRESHOLD = 70;
const STORE = "campus-job-board:v1:";
const degree = ["", "大专", "本科", "硕士", "博士"];
const $ = id => document.getElementById(id);
let snapshot, vocab, profile, statuses;
let storageOK = true;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(STORE + key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); }
  catch { storageOK = false; notice("浏览器限制了本地存储，本次操作只在当前页面生效。"); }
}
function notice(message) {
  $("notice").hidden = !message;
  $("notice").textContent = message;
}
function element(tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function fold(text) { return String(text ?? "").toLowerCase().replace(/\s+/g, ""); }
function keys(text) {
  const target = fold(text);
  return Object.keys(vocab).filter(key => vocab[key].some(alias => target.includes(fold(alias))));
}
function assess(job) {
  const byTitle = keys(job.title);
  const byDuties = keys(job.duties);
  const byRequirements = keys(job.requirements);
  const weights = new Map();
  for (const [terms, weight] of [[byTitle, 4], [byDuties, 2], [byRequirements, 3]]) {
    for (const term of terms) weights.set(term, Math.max(weights.get(term) || 0, weight));
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const yearsIn = text => [...String(text || "").matchAll(/(?:20)?(2\d)\s*届/g)]
    .map(match => 2000 + Number(match[1]));
  const yearSources = [job.graduation, job.title, job.requirements];
  const years = yearSources.flatMap(yearsIn);
  const blocked = [];
  const review = [];
  if (job.deadline && Date.parse(job.deadline) < Date.now()) blocked.push("牛客所列截止时间已过");
  if (job.direct && !job.listed) blocked.push("牛客列表状态待重新核实");
  if (profile && yearSources.some(text => {
    const listedYears = yearsIn(text);
    if (!listedYears.length || listedYears.includes(profile.year)) return false;
    return !/(?:20)?2\d\s*届?\s*[~～至—-]\s*(?:20)?2\d\s*届/.test(text);
  })) blocked.push("职位标题、资格或列表所列届别需要核对");
  if (profile && job.degree && degree.indexOf(job.degree) > degree.indexOf(profile.degree)) blocked.push("学历门槛与档案不同");
  if (!job.duties || !job.requirements) review.push("公开 JD 不完整");
  if (!job.direct) review.push("需要在牛客职位列表定位原帖");
  if (!job.graduation && !years.length) review.push("毕业届别待核实");
  const candidates = (profile?.versions || []).map(version => {
    const hits = [...weights.keys()].filter(term => version.tags.includes(term));
    const gaps = [...weights.keys()].filter(term => !version.tags.includes(term));
    const covered = hits.reduce((sum, term) => sum + weights.get(term), 0);
    const core = byTitle.length ? hits.filter(term => byTitle.includes(term)).length / byTitle.length : 0;
    const coverage = total ? covered / total : 0;
    let score = Math.round(75 * coverage + 25 * (byTitle.length ? core : 0));
    if (byTitle.includes(version.focus)) score += 4;
    score = Math.min(score, weights.size < 4 ? 85 : 96);
    const critical = ["英语工作沟通", "跨境客服与售后", "TK店铺实操"];
    const mustConfirm = critical.some(term => byRequirements.includes(term) && gaps.includes(term))
      || (/英西双语|以下任一种语言优势/.test(job.requirements) && gaps.includes("西语或其他小语种"));
    if (blocked.length || review.length || mustConfirm || weights.size < 2 || (!byTitle.length && weights.size < 4)) score = Math.min(score, 69);
    const focus = byTitle.includes(version.focus) ? 2 : byDuties.includes(version.focus) ? 1 : 0;
    const preferred = (profile.preferred || []).indexOf(version.id);
    return { version, score, hits, gaps, focus, preferred: preferred < 0 ? 999 : preferred };
  });
  candidates.sort((a, b) => b.score - a.score || b.focus - a.focus || a.preferred - b.preferred);
  return { ...job, ...candidates[0], blocked, review, status: statuses[job.id] || STATUS[0] };
}
function inQueue(job) {
  return job.score >= THRESHOLD && !["已投递", "跳过"].includes(job.status);
}
function addOption(select, value, text = value) {
  const option = element("option", text);
  option.value = value;
  select.append(option);
}
function summaryLine(label, text, className) {
  const node = element("p", undefined, className);
  node.append(element("b", label), document.createTextNode(text));
  return node;
}
function jobLink(job, label) {
  const url = new URL(job.url);
  if (url.origin !== "https://www.nowcoder.com") throw new Error("来源链接异常");
  const link = element("a", label, "button");
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}
function apply(job) {
  const body = $("apply-content");
  body.replaceChildren(element("h2", "准备投递"), element("p", job.company + " · " + job.title));
  if (job.version) body.append(summaryLine("建议使用  ", job.version.file));
  body.append(element("p", "在已登录牛客的浏览器打开职位。进入申请表后，可用牛客网申助手填写该站支持的字段，并选择上方推荐 PDF。请在招聘页检查后手动提交。"));
  if (job.blocked.length || job.review.length) body.append(summaryLine("先核实  ", [...job.blocked, ...job.review].join("、"), "attention"));
  body.append(jobLink(job, job.direct ? "打开牛客职位 ↗" : "打开牛客职位列表 ↗"));
  $("apply-dialog").showModal();
}
function card(job) {
  const wrapper = element("article", undefined, inQueue(job) ? "card ready" : "card");
  const top = element("div", undefined, "card-top");
  const info = element("div");
  info.append(element("div", job.company, "company"), element("h3", job.title));
  for (const item of [...job.cities, job.graduation, job.degree].filter(Boolean)) info.append(element("span", item, "chip"));
  const score = element("div", job.score === undefined ? "—" : job.score, "score");
  score.append(element("small", "匹配分"));
  top.append(info, score);
  wrapper.append(top);
  const match = element("div", undefined, "match");
  if (job.version) {
    match.append(summaryLine("建议简历  ", job.version.focus ? job.version.focus + " · " + job.version.file : job.version.file));
    match.append(summaryLine("匹配理由  ", job.hits.length ? "此版本与 JD 共同覆盖 " + job.hits.join("、") : "缺少可核对的共同关键词"));
    match.append(summaryLine("待核实差距  ", job.gaps.length ? job.gaps.join("、") : "词库内未检出差距，仍需核对 JD"));
  } else {
    match.append(element("p", "导入本机关键词档案后可查看匹配分、差距和简历建议。"));
  }
  if (job.blocked.length || job.review.length) match.append(summaryLine("先核实  ", [...job.blocked, ...job.review].join("、"), "attention"));
  if (job.deadline) match.append(summaryLine("牛客所列截止  ", dateLabel(job.deadline, false)));
  wrapper.append(match);
  const details = element("details");
  details.append(element("summary", "查看 JD"));
  details.append(element("p", "岗位职责\n" + (job.duties || "公开页面未提供")));
  details.append(element("p", "岗位要求\n" + (job.requirements || "公开页面未提供")));
  wrapper.append(details);
  const actions = element("div", undefined, "actions");
  const button = element("button", ["已投递", "跳过"].includes(job.status) ? "查看岗位" : "一键投递", "button");
  button.type = "button";
  button.addEventListener("click", () => {
    if (!["已投递", "跳过"].includes(job.status)) apply(job);
    window.open(jobLink(job, "").href, "_blank", "noopener,noreferrer");
  });
  const select = element("select");
  select.setAttribute("aria-label", job.company + " " + job.title + " 投递状态");
  for (const value of STATUS) addOption(select, value);
  select.value = job.status;
  select.addEventListener("change", () => {
    statuses[job.id] = select.value;
    save("statuses", statuses);
    render();
  });
  actions.append(button, select);
  wrapper.append(actions);
  return wrapper;
}
function dateLabel(value, time = true) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}), timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}
function render() {
  const jobs = snapshot.jobs.map(assess);
  const query = fold($("search").value);
  const city = $("city").value;
  const status = $("status").value;
  const sort = $("sort").value;
  const minimum = $("minimum").valueAsNumber;
  const show = jobs.filter(job => (!query || fold(job.company + job.title).includes(query))
    && (!city || job.cities.includes(city)) && (!status || status === job.status)
    && (!Number.isFinite(minimum) || job.score >= minimum)
    && (!$("only").checked || inQueue(job)));
  if (sort === "score") show.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (sort === "city") show.sort((a, b) => a.cities[0].localeCompare(b.cities[0], "zh-CN"));
  if (sort === "company") show.sort((a, b) => a.company.localeCompare(b.company, "zh-CN"));
  $("total").textContent = jobs.length;
  $("queue").textContent = profile ? jobs.filter(inQueue).length : "—";
  $("sent").textContent = Object.values(statuses).filter(s => s === "已投递").length;
  $("versions").textContent = profile?.versions.length ?? "—";
  $("profile-title").textContent = profile ? "个人匹配已启用" : "启用个人匹配";
  $("profile-note").textContent = profile ? `${profile.year} 届 · ${profile.degree} · ${storageOK ? "仅存于此浏览器" : "本次页面有效"}` : "导入本机关键词档案，档案和投递状态保存在当前浏览器。";
  $("forget").hidden = !profile;
  $("count").textContent = `${show.length} / ${jobs.length} 条`;
  $("cards").replaceChildren(...(show.length ? show.map(card) : [element("p", "当前条件下暂无岗位。", "empty")]));
}
function validProfile(data) {
  return data && Number.isInteger(data.year) && degree.slice(1).includes(data.degree)
    && Array.isArray(data.versions) && data.versions.length > 0 && data.versions.length <= 60
    && (data.preferred === undefined || Array.isArray(data.preferred))
    && data.versions.every(v => v && typeof v.id === "string" && typeof v.file === "string"
      && v.file.length < 240 && Array.isArray(v.tags) && v.tags.every(t => typeof t === "string"));
}
async function load(name) {
  const embedded = $(name);
  if (embedded) return JSON.parse(embedded.textContent);
  const response = await fetch(name + ".json", { cache: "no-cache" });
  if (!response.ok) throw new Error("读取 " + name + " 失败");
  return response.json();
}
async function init() {
  [snapshot, vocab] = await Promise.all([load("jobs"), load("keywords")]);
  const stored = read("profile", null);
  const embedded = $("local-profile");
  profile = validProfile(stored) ? stored : stored === null && embedded ? JSON.parse(embedded.textContent) : null;
  statuses = read("statuses", {});
  if (!statuses || Array.isArray(statuses) || typeof statuses !== "object") statuses = {};
  $("updated").textContent = "最后更新时间 · " + dateLabel(snapshot.updatedAt) + "（北京时间）";
  const cities = new Set(snapshot.jobs.flatMap(job => job.cities));
  for (const city of [...cities].sort((a, b) => a.localeCompare(b, "zh-CN"))) addOption($("city"), city);
  for (const id of ["search", "city", "status", "sort", "only", "minimum"]) $(id).addEventListener("input", render);
  $("profile-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 500000) throw new Error("关键词档案过大");
      const data = JSON.parse(await file.text());
      if (!validProfile(data)) throw new Error("请选择本项目生成的 profile.json");
      profile = data;
      notice("");
      save("profile", profile);
      render();
    } catch (error) { notice(error.message); }
    event.target.value = "";
  });
  $("forget").addEventListener("click", () => { profile = null; save("profile", false); render(); });
  window.addEventListener("storage", event => {
    if (event.key === STORE + "statuses") { statuses = read("statuses", {}); render(); }
  });
  render();
}
init().catch(error => { $("updated").textContent = "无法加载岗位数据"; notice(error.message + "。请使用本地预览页或已部署的网站。"); });
