import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ============================================================
   SMIS 课表 — A–H 8日轮换
   数据分三层：school（全校日历+轮换） / subjects（科目注册表） / classes（各班课表）
   轮换只由 school.noSchool 驱动；class.gradeNoSchool 不影响轮换。
   ============================================================ */

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const C = {
  navy: "#10294D",
  navy2: "#1E3E6B",
  paper: "#EDF1F6",
  card: "#FFFFFF",
  line: "#D3DBE6",
  gold: "#E0A526",
  mute: "#6E7C90",
  dim: "#9AA7B8",
};


/* ---------- 深蓝提醒条上的文字色 ----------
   主视图是浅底，科目色直接可用；提醒条是深蓝底，同样的色值对比度普遍
   不到 3:1。这里保持色相与饱和度不变，只沿 HSL 明度轴提亮，直到达到
   WCAG AA 的 4.5:1。运行时计算，用户改色或新建科目都会自动适配。      */

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const relLum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const l1 = relLum(hex2rgb(a));
  const l2 = relLum(hex2rgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
const rgb2hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, sat = 0;
  if (mx !== mn) {
    const d = mx - mn;
    sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, sat, l];
};
const hsl2hex = (h, sat, l) => {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = sat * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
};

const onNavyCache = {};
function onNavy(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#fff";
  if (onNavyCache[hex]) return onNavyCache[hex];
  let out = hex;
  try {
    let [h, sat, l] = rgb2hsl(hex2rgb(hex));
    for (let i = 0; i < 220 && contrast(out, C.navy) < 4.6; i++) {
      l = Math.min(0.97, l + 0.005);
      out = hsl2hex(h, sat, l);
    }
  } catch {
    out = "#fff";
  }
  onNavyCache[hex] = out;
  return out;
}


/* ---------- 多语言 ----------
   UI 字符串走 T()，数据里的标签走 tx()。数据标签写成 { zh, en } 对象；
   用户自己输入的内容是普通字符串，tx() 原样返回。
   加语言只要在 LOCALES 里补一份，并在 LANGS 里登记。            */

// 最后更新日期（构建时自动写入）
const UPDATED = "2026-09-03";

const LANGS = [
  { id: "zh", label: "中文" },
  { id: "en", label: "EN" },
];

const LOCALES = {
  zh: {
    wd: ["日", "一", "二", "三", "四", "五", "六"],
    wdFull: (i) => "周" + LOCALES.zh.wd[i],
    wdHead: ["一", "二", "三", "四", "五"],
    listSep: "、",
    dateWd: (d) => `${d.getMonth() + 1}/${d.getDate()}（周${LOCALES.zh.wd[d.getDay()]}）`,
    monthTitle: (y, m) => `${y} 年 ${m + 1} 月`,

    rest: "休",
    weekend: "周末",
    weekendEvents: "周末活动",
    monthWeekendEvents: "本月周末活动",
    noSchoolWith: (r) => `放假 — ${r}`,
    gradeOff: "本年级不到校",
    gradeOffChip: "本年级休",
    gradeOffNote: (l) => `轮换照常推进，这天仍算 ${l} DAY`,
    jpHoliday: "日本公共假日",

    today: "今天",
    tomorrow: "明天",
    relToday: "今天",
    relNext: "下次上学",
    bandHeader: (w, l) => `${w}要带 · ${l} day`,
    nothingToBring: "没有要特别准备的东西",
    todayIs: (l) => `今天是 ${l} DAY`,
    todayOff: "今天不上课",
    backToToday: "回到今天",
    viewWeek: "周",
    viewMonth: "月",
    previewMode: (d) => `预览模式 · 把 ${d} 当作今天`,
    exit: "退出",
    prevPage: "上一页",
    nextPage: "下一页",
    loading: "载入中…",

    settings: "设置",
    language: "语言",
    tabClasses: "班级",
    tabSubjects: "科目",
    tabCalendar: "校历",
    tabData: "数据",

    newSubjectOpt: "＋ 新科目…",
    promptNewSubject: "新科目名称（例如 DRAMA）",
    rotates: "按 A–H 轮换（不勾则每天相同）",
    promptNewClass: "新班级名称（例如 RPK 或 1A）",
    alertDupClass: "这个名称已经存在了。",
    alertKeepOne: "至少要保留一个班级。",
    confirmDelete: (n) => `删除 ${n}？`,
    addBlank: "＋ 空白",
    addCopy: "＋ 复制当前",
    phClassName: "班级名",
    phGrade: "年级",
    showing: "显示中",
    switchTo: "切到这个",
    blocksTitle: "课表时段",
    addBlock: "＋ 加一个时段",
    gradeOffTitle: "本年级不到校的日子（轮换照常推进）",
    phReason: "原因",
    addDay: "＋ 加一天",
    deleteClass: (n) => `删除 ${n}`,

    phDisplayName: "中文名",
    markSpecial: "高亮为 special 课",
    phPrep: "要带的东西，用顿号分隔",
    subjHint: "改完点一下别处保存。填了物品的科目会出现在顶部提醒条里。",

    rowYear: "学年",
    rowDays: "上课日",
    daysValue: (t, c) => `${t} 天（${c} 轮 A–H 循环）`,
    noSchoolTitle: "不上课日（跳过轮换）",
    gradeOffSettings: "本年级不到校（轮换照常）",

    dataHint: "这是全部设置的完整备份。下载或复制一份保存起来；换设备、换浏览器、或者明年新学年时，从这里导回去。",
    editJson: "编辑 JSON",
    saveOverwrite: "保存并覆盖",
    cancelRestore: "取消并还原",
    download: "下载文件",
    copy: "复制",
    copied: "已复制",
    importFile: "导入文件",
    alertNoDownload: "这个环境不支持下载，可以改用「复制」。",
    alertCopyFail: "复制失败，可以手动全选文本框里的内容。",
    alertReadFail: "读取文件失败。",
    alertBadJson: "JSON 格式有误，检查一下括号和引号。",
    footerNote: "非官方工具 · 课表与校历整理自 SMIS 公布的日程，以学校通知为准",
    getInTouch: "联系我",
    updated: (d) => `更新于 ${d}`,
  },

  en: {
    wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    wdFull: (i) => LOCALES.en.wd[i],
    wdHead: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    listSep: ", ",
    dateWd: (d) => `${LOCALES.en.wd[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`,
    monthTitle: (y, m) =>
      `${["January","February","March","April","May","June","July","August","September","October","November","December"][m]} ${y}`,

    rest: "Off",
    weekend: "Weekend",
    weekendEvents: "Weekend",
    monthWeekendEvents: "Weekend events this month",
    noSchoolWith: (r) => `No school — ${r}`,
    gradeOff: "Grade not in session",
    gradeOffChip: "Grade off",
    gradeOffNote: (l) => `Rotation continues — still ${l} DAY`,
    jpHoliday: "Japanese public holiday",

    today: "today",
    tomorrow: "tomorrow",
    relToday: "Today",
    relNext: "Next school day",
    bandHeader: (w, l) => `Bring ${w} · ${l} day`,
    nothingToBring: "Nothing special to bring",
    todayIs: (l) => `Today is ${l} DAY`,
    todayOff: "No school today",
    backToToday: "Today",
    viewWeek: "Week",
    viewMonth: "Month",
    previewMode: (d) => `Preview — treating ${d} as today`,
    exit: "Exit",
    prevPage: "Previous",
    nextPage: "Next",
    loading: "Loading…",

    settings: "Settings",
    language: "Language",
    tabClasses: "Classes",
    tabSubjects: "Subjects",
    tabCalendar: "Calendar",
    tabData: "Data",

    newSubjectOpt: "＋ New subject…",
    promptNewSubject: "Subject name (e.g. DRAMA)",
    rotates: "Rotates A–H (unchecked = same every day)",
    promptNewClass: "Class name (e.g. RPK or 1A)",
    alertDupClass: "That name already exists.",
    alertKeepOne: "Keep at least one class.",
    confirmDelete: (n) => `Delete ${n}?`,
    addBlank: "＋ Blank",
    addCopy: "＋ Duplicate",
    phClassName: "Class",
    phGrade: "Grade",
    showing: "Showing",
    switchTo: "Switch to",
    blocksTitle: "Periods",
    addBlock: "＋ Add period",
    gradeOffTitle: "Days this grade is off (rotation continues)",
    phReason: "Reason",
    addDay: "＋ Add day",
    deleteClass: (n) => `Delete ${n}`,

    phDisplayName: "Full name",
    markSpecial: "Highlight as a special",
    phPrep: "Items to bring, comma separated",
    subjHint: "Tap elsewhere to save. Subjects with items appear in the reminder bar.",

    rowYear: "School year",
    rowDays: "School days",
    daysValue: (t, c) => `${t} days (${c} × A–H cycles)`,
    noSchoolTitle: "No-school days (skipped in rotation)",
    gradeOffSettings: "Grade off (rotation continues)",

    dataHint:
      "A full backup of your settings. Download or copy one to keep; import it here when you switch device, browser, or school year.",
    editJson: "Edit JSON",
    saveOverwrite: "Save & overwrite",
    cancelRestore: "Cancel",
    download: "Download",
    copy: "Copy",
    copied: "Copied",
    importFile: "Import file",
    alertNoDownload: "Downloads aren't supported here — use Copy instead.",
    alertCopyFail: "Copy failed — select the text manually.",
    alertReadFail: "Could not read that file.",
    alertBadJson: "Invalid JSON — check the brackets and quotes.",
    footerNote: "Unofficial tool · Schedule compiled from SMIS's published dates",
    getInTouch: "Get in touch",
    updated: (d) => `Updated ${d}`,
  },
};

// 当前语言。App 在渲染开头设置，子组件读取，避免层层传 prop。
let LANG = "zh";

function T(key, ...args) {
  const dict = LOCALES[LANG] || LOCALES.en;
  const v = dict[key] !== undefined ? dict[key] : LOCALES.en[key];
  return typeof v === "function" ? v(...args) : v;
}

// 数据标签：{ zh, en } 取当前语言；普通字符串（用户自己输入的）原样返回
function subName(sub) {
  if (!sub) return "";
  return sub[LANG] || sub.zh || sub.en || "";
}

function tx(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[LANG] || v.en || v.zh || "";
}

function detectLang() {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && LOCALES[q.toLowerCase()]) return q.toLowerCase();
  } catch {}
  try {
    return /^zh/i.test(navigator.language || "") ? "zh" : "en";
  } catch {
    return "en";
  }
}

/* ---------- 默认数据 ---------- */

const expand = (a, b) => {
  const out = [];
  const d = new Date(a + "T00:00:00");
  const end = new Date(b + "T00:00:00");
  while (d <= end) {
    out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

const DEFAULT_SCHOOL = {
  name: "St. Mary's International School",
  yearStart: "2026-08-24",
  yearEnd: "2027-06-11",
  // 锚点即校准点，第一条是学年起点
  calibrations: [{ date: "2026-08-24", letter: "A" }],
  noSchool: [
    { dates: ["2026-09-21"], label: { zh: "Back to School（仅家长）", en: "Back to School (parents only)" } },
    { dates: expand("2026-10-12", "2026-10-16"), label: { zh: "秋假", en: "Autumn Break" } },
    { dates: ["2026-11-03"], label: { zh: "PTC（仅家长）", en: "PTC (parents only)" } },
    { dates: ["2026-11-23"], label: { zh: "教师培训日", en: "PD Day" } },
    { dates: ["2026-11-27"], label: { zh: "感恩节", en: "Thanksgiving" } },
    { dates: expand("2026-12-18", "2027-01-05"), label: { zh: "圣诞假期", en: "Xmas Break" } },
    { dates: ["2027-01-11"], label: { zh: "教师培训日", en: "PD Day" } },
    { dates: ["2027-02-11"], label: { zh: "学生主导 PTC", en: "PTC (student-led)" } },
    { dates: ["2027-02-19"], label: { zh: "教师培训日", en: "PD Day" } },
    { dates: expand("2027-02-22", "2027-02-23"), label: { zh: "冬假", en: "Winter Break" } },
    { dates: expand("2027-03-22", "2027-03-26"), label: { zh: "春假", en: "Spring Break" } },
    { dates: ["2027-05-03"], label: { zh: "公共假日", en: "Public Holiday" } },
    { dates: ["2027-05-10"], label: { zh: "Carnival 补休", en: "Carnival Recovery" } },
  ],
  // PDF 上带 ✱ 星标的日子
  holidays: [
    { date: "2026-09-21", label: { zh: "敬老の日", en: "Respect for the Aged Day" } },
    { date: "2026-09-22", label: { zh: "国民の休日", en: "Citizens' Holiday" } },
    { date: "2026-09-23", label: { zh: "秋分の日", en: "Autumnal Equinox" } },
    { date: "2026-10-12", label: { zh: "スポーツの日", en: "Sports Day" } },
    { date: "2026-11-03", label: { zh: "文化の日", en: "Culture Day" } },
    { date: "2026-11-23", label: { zh: "勤労感謝の日", en: "Labor Thanksgiving" } },
    { date: "2027-01-01", label: { zh: "元日", en: "New Year's Day" } },
    { date: "2027-01-11", label: { zh: "成人の日", en: "Coming of Age Day" } },
    { date: "2027-02-11", label: { zh: "建国記念の日", en: "National Foundation Day" } },
    { date: "2027-02-23", label: { zh: "天皇誕生日", en: "Emperor's Birthday" } },
    { date: "2027-03-20", label: { zh: "春分の日", en: "Vernal Equinox" } },
    { date: "2027-04-29", label: { zh: "昭和の日", en: "Showa Day" } },
    { date: "2027-05-03", label: { zh: "憲法記念日", en: "Constitution Day" } },
    { date: "2027-05-04", label: { zh: "みどりの日", en: "Greenery Day" } },
    { date: "2027-05-05", label: { zh: "こどもの日", en: "Children's Day" } },
  ],
  events: [
    { date: "2026-08-24", label: { zh: "G3–12 开学", en: "First day G3–12" } },
    { date: "2026-08-25", label: { zh: "RP–G2 开学", en: "First day RP–G2" } },
    { date: "2026-10-23", label: { zh: "Q1 结束", en: "End of Q1" } },
    { date: "2026-11-13", label: "Fall Play" },
    { date: "2026-11-14", label: "Fall Play" },
    { date: "2026-11-20", label: "Bingo" },
    { date: "2026-12-05", label: "ES Choral Christmas Concert" },
    { date: "2026-12-06", label: "MS/HS Choral Christmas Concert" },
    { date: "2026-12-08", label: { zh: "St. Mary's Day 庆典", en: "St. Mary's Day" } },
    { date: "2026-12-09", label: "Winter Instrumental Concert" },
    { date: "2027-01-22", label: { zh: "Q2 / S1 结束", en: "End of Q2 / S1" } },
    { date: "2027-02-06", label: "Jazz Concert" },
    { date: "2027-02-18", label: "The JAM Show" },
    { date: "2027-04-02", label: { zh: "Q3 结束", en: "End of Q3" } },
    { date: "2027-04-09", label: "Spring Musical" },
    { date: "2027-04-10", label: "Spring Musical" },
    { date: "2027-04-11", label: "Spring Musical" },
    { date: "2027-04-23", label: "MS/HS Spring Choral Concert" },
    { date: "2027-05-08", label: "Carnival" },
    { date: "2027-05-21", label: "Spring Instrumental Concert" },
    { date: "2027-05-27", label: "ES Spring Choral Concert" },
    { date: "2027-05-29", label: { zh: "HS 毕业典礼", en: "HS Graduation" } },
    { date: "2027-06-09", label: "ES Sports Day" },
    { date: "2027-06-10", label: "Jazz Nite" },
    { date: "2027-06-11", label: { zh: "最后一天 · 11:30 放学", en: "Last day · 11:30 dismissal" } },
  ],
};

const DEFAULT_SUBJECTS = {
  ELA: { zh: "英语语文", en: "English", color: "#4A6FA5" },
  MATH: { zh: "数学", en: "Math", color: "#2E8B6F" },
  "SS/SCI": { zh: "社会 / 科学", en: "Social / Science", color: "#6B8E23" },
  REL: { zh: "宗教", en: "Religion", color: "#8C7B5A" },
  CORE: { zh: "核心课", en: "Core", color: "#5A6B7B" },
  JPN: { zh: "日语", en: "Japanese", color: "#C79A2E" },
  ART: { zh: "美术", en: "Art", color: "#C2652A", special: true, prep: [{ zh: "罩衫", en: "Art shirt" }] },
  PE: { zh: "体育", en: "Physical Education", color: "#D93E4A", special: true, prep: [{ zh: "运动服", en: "PE uniform" }] },
  SWIM: {
    zh: "游泳", en: "Swimming", color: "#1E9BC4", special: true,
    prep: [{ zh: "泳衣", en: "Swimsuit" }, { zh: "泳镜", en: "Goggles" }, { zh: "浴巾", en: "Towel" }],
  },
  LIB: { zh: "图书馆", en: "Library", color: "#7B5EA7", special: true, prep: [{ zh: "还书", en: "Return books" }] },
  MUS: { zh: "音乐", en: "Music", color: "#B8478E", special: true, prep: [] },
  "Home Room / Prayer": { zh: "晨会 / 祈祷", en: "Homeroom & Prayer", color: C.dim, break: true },
  Recess: { zh: "课间", en: "Recess", color: C.dim, break: true },
  "Lunch / Recess": { zh: "午餐 / 课间", en: "Lunch & Recess", color: C.dim, break: true },
};

const RPJ = {
  id: "RPJ",
  name: "RPJ",
  grade: "RP",
  gradeNoSchool: [
    { date: "2026-08-24", label: { zh: "RP–G2 晚一天开学", en: "RP–G2 start one day later" } },
    { date: "2027-06-07", label: { zh: "仅 ES 放假（MS/HS 照常）", en: "ES only (MS/HS in session)" } },
  ],
  blocks: [
    { label: "HR", start: "8:15", end: "8:30", subject: "Home Room / Prayer" },
    { label: "P1", start: "8:30", end: "10:00", subject: "ELA" },
    { label: "", start: "10:00", end: "10:25", subject: "Recess" },
    {
      label: "P2",
      start: "10:25",
      end: "11:25",
      subject: { A: "ART", B: "PE", C: "LIB", D: "MUS", E: "ART", F: "PE", G: "MUS", H: "SWIM" },
    },
    { label: "P3", start: "11:25", end: "12:25", subject: "Lunch / Recess" },
    { label: "P4", start: "12:25", end: "13:20", subject: "MATH" },
    {
      label: "P5",
      start: "13:20",
      end: "14:15",
      subject: { A: "SS/SCI", B: "SS/SCI", C: "SS/SCI", D: "REL", E: "SS/SCI", F: "SS/SCI", G: "SS/SCI", H: "REL" },
    },
    {
      label: "P6",
      start: "14:20",
      end: "15:15",
      subject: { A: "CORE", B: "JPN", C: "CORE", D: "JPN", E: "CORE", F: "JPN", G: "CORE", H: "JPN" },
    },
  ],
};

// RPY 与 RPJ 只有 P2 的 special 顺序不同
const RPY = {
  ...RPJ,
  id: "RPY",
  name: "RPY",
  gradeNoSchool: RPJ.gradeNoSchool.map((g) => ({ ...g })),
  blocks: RPJ.blocks.map((b) =>
    b.label === "P2"
      ? { ...b, subject: { A: "MUS", B: "ART", C: "PE", D: "LIB", E: "SWIM", F: "ART", G: "PE", H: "MUS" } }
      : { ...b }
  ),
};

// RPH 同样只有 P2 的 special 顺序不同
const RPH = {
  ...RPJ,
  id: "RPH",
  name: "RPH",
  gradeNoSchool: RPJ.gradeNoSchool.map((g) => ({ ...g })),
  blocks: RPJ.blocks.map((b) =>
    b.label === "P2"
      ? { ...b, subject: { A: "LIB", B: "MUS", C: "ART", D: "PE", E: "MUS", F: "SWIM", G: "ART", H: "PE" } }
      : { ...b }
  ),
};

const DEFAULT_CLASSES = [RPJ, RPY, RPH];

// 递增这个数字，下次载入会补进新增的默认班级/科目，但不覆盖你改过的内容
const SEED = 9;

/* ---------- 日期工具 ---------- */

// 函数声明而非 const：DEFAULT_SCHOOL 在模块加载时就会通过 expand() 调用 iso()
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parse(s) {
  return new Date(s + "T00:00:00");
}
function todayISO() {
  return iso(new Date());
}

// ?day=20260912 或 ?day=2026-09-12 —— 把那天当作今天，方便预览
function overrideToday() {
  try {
    const v = new URLSearchParams(window.location.search).get("day");
    const m = v && /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  } catch {
    return null;
  }
}
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const t12 = (s) => {
  const [h, m] = s.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}`;
};

/* ---------- 轮换核心 ---------- */

function buildYear(school) {
  const noMap = new Map();
  school.noSchool.forEach((g) => g.dates.forEach((d) => noMap.set(d, g.label)));
  const cal = new Map(school.calibrations.map((c) => [c.date, c.letter]));
  const evt = new Map();
  school.events.forEach((e) => {
    if (!evt.has(e.date)) evt.set(e.date, []);
    evt.get(e.date).push(e.label);
  });

  const hol = new Map((school.holidays || []).map((h) => [h.date, h.label]));

  const days = [];
  const byDate = new Map();
  const d = parse(school.yearStart);
  const end = parse(school.yearEnd);
  let idx = 0;

  while (d <= end) {
    const key = iso(d);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    const off = noMap.get(key);
    let rec;
    if (weekend) {
      rec = { date: key, dow, kind: "weekend" };
    } else if (off !== undefined) {
      rec = { date: key, dow, kind: "off", reason: off };
    } else {
      if (cal.has(key)) idx = LETTERS.indexOf(cal.get(key));
      rec = { date: key, dow, kind: "school", letter: LETTERS[idx % 8] };
      idx++;
    }
    rec.events = evt.get(key) || [];
    rec.holiday = hol.get(key) || null;
    days.push(rec);
    byDate.set(key, rec);
    d.setDate(d.getDate() + 1);
  }
  return { days, byDate };
}

const subjectAt = (block, letter) =>
  typeof block.subject === "string" ? block.subject : block.subject[letter];

function dayForClass(rec, cls) {
  if (!rec) return null;
  const skip = cls.gradeNoSchool.find((g) => g.date === rec.date);
  return { ...rec, classOff: skip ? skip.label : null };
}

function prepFor(rec, cls, subjects) {
  if (!rec || rec.kind !== "school") return [];
  const out = [];
  cls.blocks.forEach((b) => {
    const name = subjectAt(b, rec.letter);
    const s = subjects[name];
    if (s && s.prep && s.prep.length) out.push({ name, ...s });
  });
  return out;
}

/* ---------- 存储 ---------- */

const KEY = { school: "smis:school", classes: "smis:classes", subjects: "smis:subjects", ui: "smis:ui" };

const store = {
  async get(k) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(k, false);
        return r ? JSON.parse(r.value) : null;
      }
      // 独立部署（Vercel）时走这条；在 Claude artifact 里不会执行
      const v = window.localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  async set(k, v) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        await window.storage.set(k, JSON.stringify(v), false);
        return true;
      }
      window.localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

/* ---------- 响应式 ---------- */

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(min-width: 760px)");
      const on = () => setWide(mq.matches);
      on();
      if (mq.addEventListener) {
        mq.addEventListener("change", on);
        return () => mq.removeEventListener("change", on);
      }
      mq.addListener(on);
      return () => mq.removeListener(on);
    } catch {
      return undefined;
    }
  }, []);
  return wide;
}

/* ---------- 小组件 ---------- */

function Letter({ letter, size = 34, muted }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: muted ? "#C6CFDC" : C.navy,
        color: "#fff",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Archivo, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: size * 0.55,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function RestChip({ size = 34 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 7,
        background: "#DCE3EC",
        color: C.mute,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.32),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {T("rest")}
    </div>
  );
}

function Block({ block, letter, subjects }) {
  const name = subjectAt(block, letter);
  const s = subjects[name] || { zh: "", color: C.dim };
  const isBreak = !!s.break;
  const special = !!s.special;
  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        padding: special ? "7px 8px" : "6px 0 6px 8px",
        borderLeft: `3px solid ${special ? s.color : isBreak ? "transparent" : s.color + "66"}`,
        background: special ? s.color + "14" : "transparent",
        borderRadius: special ? 5 : 0,
        opacity: isBreak ? 0.5 : 1,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: 10.5,
            color: C.mute,
            letterSpacing: "-0.01em",
          }}
        >
          {t12(block.start)}–{t12(block.end)}
          {block.label ? <span style={{ marginLeft: 6, opacity: 0.65 }}>{block.label}</span> : null}
        </div>
        <div
          style={{
            fontSize: special ? 14.5 : 13.5,
            fontWeight: special ? 650 : 550,
            color: special ? s.color : isBreak ? C.mute : C.navy,
            lineHeight: 1.3,
            marginTop: 1,
          }}
        >
          {isBreak ? subName(s) || name : name}
        </div>
        {!isBreak && subName(s) && (
          <div style={{ fontSize: 11, color: C.mute, lineHeight: 1.3 }}>{subName(s)}</div>
        )}
      </div>
    </div>
  );
}

function DayCard({ rec, cls, subjects, relLabel, isToday }) {
  const d = parse(rec.date);
  const off = rec.kind !== "school";
  const classOff = rec.classOff;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${isToday ? C.navy : C.line}`,
        borderRadius: 10,
        padding: 11,
        minHeight: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {relLabel && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: isToday ? C.navy : C.mute,
                textTransform: "uppercase",
              }}
            >
              {relLabel}
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 650, color: C.navy }}>
            {d.getMonth() + 1}/{d.getDate()}
            <span style={{ fontSize: 12, color: C.mute, marginLeft: 5, fontWeight: 500 }}>
              {T("wdFull", rec.dow)}
              {rec.holiday && (
                <span
                  style={{
                    display: "inline-block",
                    width: 5,
                    height: 5,
                    borderRadius: 5,
                    background: "#D93E4A",
                    verticalAlign: "top",
                    marginLeft: 2,
                    marginTop: 4.5,
                  }}
                />
              )}
            </span>
          </div>
        </div>
        {rec.kind === "school" ? <Letter letter={rec.letter} muted={!!classOff} /> : <RestChip />}
      </div>

      {rec.events.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: "#8A6410",
            background: C.gold + "22",
            borderRadius: 5,
            padding: "4px 7px",
            marginBottom: 8,
            lineHeight: 1.4,
          }}
        >
          {rec.events.map(tx).join(" · ")}
        </div>
      )}

      {off ? (
        <div style={{ fontSize: 12.5, color: C.mute, padding: "10px 2px", lineHeight: 1.5 }}>
          {rec.kind === "weekend" ? T("weekend") : T("noSchoolWith", tx(rec.reason))}
        </div>
      ) : classOff ? (
        <div style={{ fontSize: 12.5, color: C.mute, padding: "8px 2px", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: C.navy }}>{T("gradeOff")}</div>
          <div style={{ marginTop: 2 }}>{tx(classOff)}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
            {T("gradeOffNote", rec.letter)}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {cls.blocks.map((b, i) => (
            <Block key={i} block={b} letter={rec.letter} subjects={subjects} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekendCard({ item, isToday }) {
  return (
    <div
      style={{
        background: C.card,
        border: `2px dashed ${isToday ? C.navy : C.line}`,
        borderRadius: 10,
        padding: 11,
        minHeight: 120,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: C.navy }}>{T("weekendEvents")}</div>
        </div>
        <RestChip />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {item.days.map((d) => (
          <div key={d.date}>
            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, color: C.mute, marginBottom: 3 }}>
              {T("dateWd", parse(d.date))}
            </div>
            {d.events.map((ev, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12, color: "#8A6410", background: C.gold + "26",
                  borderRadius: 5, padding: "4px 7px", marginBottom: 3, lineHeight: 1.4,
                }}
              >
                {tx(ev)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrepCol({ rec, cls, subjects, today, primary }) {
  const items = prepFor(rec, cls, subjects);
  const d = parse(rec.date);
  const tmr = new Date(parse(today));
  tmr.setDate(tmr.getDate() + 1);
  const when =
    rec.date === today ? T("today") : rec.date === iso(tmr) ? T("tomorrow") : T("dateWd", d);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 5, fontSize: 10,
          letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold,
          fontWeight: 700, marginBottom: 6, lineHeight: 1.4,
        }}
      >
        {primary && (
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.gold}
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }} aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        )}
        <span style={{ minWidth: 0 }}>{T("bandHeader", when, rec.letter)}</span>
      </div>

      {items.length ? (
        items.map((it) => (
          <div key={it.name} style={{ display: "flex", gap: 7, alignItems: "baseline", marginTop: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: onNavy(it.color), flexShrink: 0 }}>{it.name}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, minWidth: 0 }}>{it.prep.map(tx).join(" · ")}</span>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.72 }}>{T("nothingToBring")}</div>
      )}
    </div>
  );
}

function PrepBanner({ rec, next, cls, subjects, today }) {
  if (!rec || rec.classOff) return null;
  return (
    <div style={{ background: C.navy, borderRadius: 10, padding: "10px 12px", color: "#fff", marginBottom: 10, display: "flex", gap: 12 }}>
      <PrepCol rec={rec} cls={cls} subjects={subjects} today={today} primary />
      {next && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", borderLeft: "1px solid rgba(255,255,255,.18)", paddingLeft: 12 }}>
          <PrepCol rec={next} cls={cls} subjects={subjects} today={today} />
        </div>
      )}
    </div>
  );
}

function Chip({ bg, fg, children }) {
  return (
    <div
      style={{
        background: bg,
        color: fg,
        fontSize: 9.5,
        fontWeight: 650,
        lineHeight: 1.4,
        borderRadius: 3,
        padding: "1px 3px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "left",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </div>
  );
}

function MonthView({ year, cls, subjects, month, setMonth, onPick, wide, today }) {
  const first = new Date(month.y, month.m, 1);
  const start = new Date(first);
  const shift = (first.getDay() + 6) % 7; // 周一为首
  start.setDate(1 - shift);

  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 5; i++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    cur.setDate(cur.getDate() + 2);
    weeks.push(row);
    if (cur.getMonth() !== month.m && cur > first) break;
  }

  // 只能在学年范围内翻页
  const bounds = useMemo(() => {
    const a = parse(year.days[0].date);
    const b = parse(year.days[year.days.length - 1].date);
    return { lo: a.getFullYear() * 12 + a.getMonth(), hi: b.getFullYear() * 12 + b.getMonth() };
  }, [year]);
  const pos = month.y * 12 + month.m;

  // 本月周末有活动的日子，单独列在日历下面
  const weekendEvents = useMemo(
    () =>
      year.days.filter(
        (d) =>
          d.kind === "weekend" &&
          d.events.length > 0 &&
          parse(d.date).getFullYear() === month.y &&
          parse(d.date).getMonth() === month.m
      ),
    [year, month]
  );
  const canPrev = pos > bounds.lo;
  const canNext = pos < bounds.hi;

  const step = (n) => {
    const t = Math.min(bounds.hi, Math.max(bounds.lo, pos + n));
    setMonth({ y: Math.floor(t / 12), m: t % 12 });
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button
          onClick={() => step(-1)}
          disabled={!canPrev}
          style={{ ...navBtn, opacity: canPrev ? 1 : 0.3, cursor: canPrev ? "pointer" : "default" }}
        >
          ‹
        </button>
        <div style={{ fontSize: 15, fontWeight: 650, color: C.navy }}>
          {T("monthTitle", month.y, month.m)}
        </div>
        <button
          onClick={() => step(1)}
          disabled={!canNext}
          style={{ ...navBtn, opacity: canNext ? 1 : 0.3, cursor: canNext ? "pointer" : "default" }}
        >
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, marginBottom: 5 }}>
        {T("wdHead").map((x) => (
          <div key={x} style={{ textAlign: "center", fontSize: 10.5, color: C.mute, fontWeight: 600 }}>
            {x}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
            {row.map((d) => {
              const key = iso(d);
              const inMonth = d.getMonth() === month.m;
              const raw = year.byDate.get(key);
              const rec = raw ? dayForClass(raw, cls) : null;
              const specials =
                rec && rec.kind === "school" && !rec.classOff
                  ? cls.blocks
                      .map((b) => {
                        const n = subjectAt(b, rec.letter);
                        return { name: n, ...(subjects[n] || {}) };
                      })
                      .filter((x) => x.special)
                  : [];
              return (
                <button
                  key={key}
                  onClick={() => rec && onPick(key)}
                  style={{
                    height: wide ? 104 : 80,
                    minWidth: 0,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    border: `1px solid ${key === today ? C.navy : C.line}`,
                    background:
                      !rec || !inMonth ? "#F5F7FA" : rec.kind === "school" ? C.card : "#E4E9F0",
                    borderRadius: 7,
                    padding: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "flex-start",
                    gap: 1,
                    opacity: inMonth ? 1 : 0.35,
                    cursor: rec ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 3, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: key === today ? C.navy : C.mute,
                          fontWeight: key === today ? 800 : 500,
                          lineHeight: 1.1,
                          paddingLeft: 1,
                        }}
                      >
                        {d.getDate()}
                      </span>
                      {rec?.holiday && (
                        <span
                          style={{
                            width: 4, height: 4, borderRadius: 4, background: "#D93E4A",
                            flexShrink: 0, alignSelf: "flex-start", marginTop: 2,
                          }}
                        />
                      )}
                      {key === today && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>
                          {T("relToday")}
                        </span>
                      )}
                    </span>
                    {rec && rec.kind === "school" && (
                      <Letter letter={rec.letter} size={15} muted={!!rec.classOff} />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2, width: "100%", minWidth: 0 }}>
                    {specials.map((sp) => (
                      <Chip key={sp.name} bg={sp.color} fg="#fff">{sp.name}</Chip>
                    ))}
                    {rec?.classOff && <Chip bg="#C6CFDC" fg="#41546E">{T("gradeOffChip")}</Chip>}
                    {rec?.kind === "off" && <Chip bg="#CFD8E3" fg="#41546E">{tx(rec.reason)}</Chip>}
                    {rec?.events?.map((ev, i) => (
                      <Chip key={i} bg={C.gold + "33"} fg="#8A6410">{tx(ev)}</Chip>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {weekendEvents.length > 0 && (
        <div
          style={{
            marginTop: 12,
            background: C.gold + "26",
            border: `1px solid ${C.gold}66`,
            borderRadius: 9,
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "#8A6410", textTransform: "uppercase", marginBottom: 7 }}>
            {T("monthWeekendEvents")}
          </div>
          {weekendEvents.map((d) => (
            <div key={d.date} style={{ display: "flex", gap: 9, alignItems: "baseline", marginBottom: 5 }}>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 11.5, color: "#A57A18", flexShrink: 0, minWidth: 62,
                }}
              >
                {T("dateWd", parse(d.date))}
              </span>
              <span style={{ fontSize: 12.5, color: "#6E4E08", fontWeight: 550, lineHeight: 1.45 }}>
                {d.events.map(tx).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const navBtn = {
  width: 34,
  height: 34,
  border: `1px solid ${C.line}`,
  background: C.card,
  borderRadius: 8,
  color: C.navy,
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
};


/* ---------- 编辑器零件 ---------- */

const inp = {
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: C.navy,
  background: C.card,
  boxSizing: "border-box",
};
const btnS = {
  border: `1px solid ${C.line}`,
  background: C.card,
  color: C.navy,
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 9px",
  cursor: "pointer",
  fontFamily: "inherit",
};
const pad = (t) => {
  const [h, m] = String(t || "0:00").split(":");
  return `${String(h).padStart(2, "0")}:${(m || "00").padStart(2, "0")}`;
};
const PALETTE = ["#4A6FA5", "#2E8B6F", "#C2652A", "#D93E4A", "#1E9BC4", "#7B5EA7", "#B8478E", "#6B8E23", "#C79A2E", "#5A6B7B"];

function SubjectPick({ value, subjects, onPick, onNew }) {
  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === "__new__" ? onNew() : onPick(e.target.value))}
      style={{ ...inp, padding: "6px 4px", fontSize: 12.5, width: "100%" }}
    >
      {Object.keys(subjects).map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
      {!subjects[value] && <option value={value}>{value}</option>}
      <option value="__new__">{T("newSubjectOpt")}</option>
    </select>
  );
}

function BlockRow({ block, subjects, onChange, onRemove, onMove, addSubject }) {
  const rotating = typeof block.subject !== "string";
  const newSubj = (apply) => {
    const name = window.prompt(T("promptNewSubject"));
    if (!name) return;
    addSubject(name.trim());
    apply(name.trim());
  };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 10, marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
        <input
          value={block.label}
          onChange={(e) => onChange({ ...block, label: e.target.value })}
          placeholder="P1"
          style={{ ...inp, width: 46, padding: "6px 6px", textAlign: "center", fontWeight: 600 }}
        />
        <input type="time" value={pad(block.start)} onChange={(e) => onChange({ ...block, start: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0, padding: "6px" }} />
        <span style={{ color: C.mute, fontSize: 12 }}>–</span>
        <input type="time" value={pad(block.end)} onChange={(e) => onChange({ ...block, end: e.target.value })} style={{ ...inp, flex: 1, minWidth: 0, padding: "6px" }} />
        <button onClick={() => onMove(-1)} style={{ ...btnS, padding: "5px 7px" }}>↑</button>
        <button onClick={() => onMove(1)} style={{ ...btnS, padding: "5px 7px" }}>↓</button>
        <button onClick={onRemove} style={{ ...btnS, padding: "5px 7px", color: "#C0392B" }}>✕</button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mute, marginBottom: 7, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={rotating}
          onChange={(e) =>
            onChange({
              ...block,
              subject: e.target.checked
                ? Object.fromEntries(LETTERS.map((l) => [l, block.subject]))
                : block.subject[LETTERS[0]],
            })
          }
        />
        {T("rotates")}
      </label>

      {rotating ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
          {LETTERS.map((l) => (
            <div key={l}>
              <div style={{ fontSize: 10, color: C.mute, fontWeight: 700, marginBottom: 2, textAlign: "center" }}>{l}</div>
              <SubjectPick
                value={block.subject[l]}
                subjects={subjects}
                onPick={(v) => onChange({ ...block, subject: { ...block.subject, [l]: v } })}
                onNew={() => newSubj((v) => onChange({ ...block, subject: { ...block.subject, [l]: v } }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <SubjectPick
          value={block.subject}
          subjects={subjects}
          onPick={(v) => onChange({ ...block, subject: v })}
          onNew={() => newSubj((v) => onChange({ ...block, subject: v }))}
        />
      )}
    </div>
  );
}

function ClassEditor({ classes, setClasses, activeId, setActiveId, subjects, addSubject }) {
  const [editId, setEditId] = useState(activeId);
  const cls = classes.find((c) => c.id === editId) || classes[0];
  const patch = (o) => setClasses(classes.map((c) => (c.id === cls.id ? { ...c, ...o } : c)));

  const addClass = (copyFrom) => {
    const name = window.prompt(T("promptNewClass"));
    if (!name) return;
    const id = name.trim();
    if (classes.find((c) => c.id === id)) return alert(T("alertDupClass"));
    const base = copyFrom
      ? { ...cls, blocks: JSON.parse(JSON.stringify(cls.blocks)), gradeNoSchool: [...cls.gradeNoSchool] }
      : { grade: "", gradeNoSchool: [], blocks: [{ label: "P1", start: "08:30", end: "10:00", subject: "ELA" }] };
    setClasses([...classes, { ...base, id, name: id }]);
    setEditId(id);
  };

  const removeClass = () => {
    if (classes.length < 2) return alert(T("alertKeepOne"));
    if (!window.confirm(T("confirmDelete", cls.name))) return;
    const rest = classes.filter((c) => c.id !== cls.id);
    setClasses(rest);
    setEditId(rest[0].id);
    if (activeId === cls.id) setActiveId(rest[0].id);
  };

  const moveBlock = (i, d) => {
    const b = [...cls.blocks];
    const j = i + d;
    if (j < 0 || j >= b.length) return;
    [b[i], b[j]] = [b[j], b[i]];
    patch({ blocks: b });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => setEditId(c.id)}
            style={{
              ...btnS,
              background: c.id === editId ? C.navy : C.card,
              color: c.id === editId ? "#fff" : C.navy,
              borderColor: c.id === editId ? C.navy : C.line,
            }}
          >
            {c.name}
          </button>
        ))}
        <button onClick={() => addClass(false)} style={{ ...btnS, color: C.mute }}>{T("addBlank")}</button>
        <button onClick={() => addClass(true)} style={{ ...btnS, color: C.mute }}>{T("addCopy")}</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input value={cls.name} onChange={(e) => patch({ name: e.target.value })} placeholder={T("phClassName")} style={{ ...inp, flex: 2, minWidth: 0 }} />
        <input value={cls.grade} onChange={(e) => patch({ grade: e.target.value })} placeholder={T("phGrade")} style={{ ...inp, flex: 1, minWidth: 0 }} />
        <button
          onClick={() => { setActiveId(cls.id); }}
          style={{ ...btnS, background: activeId === cls.id ? "#DFE5EE" : C.card, whiteSpace: "nowrap" }}
        >
          {activeId === cls.id ? T("showing") : T("switchTo")}
        </button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{T("blocksTitle")}</div>
      {cls.blocks.map((b, i) => (
        <BlockRow
          key={i}
          block={b}
          subjects={subjects}
          addSubject={addSubject}
          onChange={(nb) => patch({ blocks: cls.blocks.map((x, j) => (j === i ? nb : x)) })}
          onRemove={() => patch({ blocks: cls.blocks.filter((_, j) => j !== i) })}
          onMove={(d) => moveBlock(i, d)}
        />
      ))}
      <button
        onClick={() => patch({ blocks: [...cls.blocks, { label: "", start: "15:15", end: "16:00", subject: "ELA" }] })}
        style={{ ...btnS, width: "100%", padding: "9px" }}
      >
        {T("addBlock")}
      </button>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "16px 0 6px" }}>
        {T("gradeOffTitle")}
      </div>
      {cls.gradeNoSchool.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            type="date"
            value={g.date}
            onChange={(e) => patch({ gradeNoSchool: cls.gradeNoSchool.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })}
            style={{ ...inp, flex: 1, minWidth: 0 }}
          />
          <input
            value={tx(g.label)}
            onChange={(e) => patch({ gradeNoSchool: cls.gradeNoSchool.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
            placeholder={T("phReason")}
            style={{ ...inp, flex: 1.3, minWidth: 0 }}
          />
          <button onClick={() => patch({ gradeNoSchool: cls.gradeNoSchool.filter((_, j) => j !== i) })} style={{ ...btnS, color: "#C0392B" }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => patch({ gradeNoSchool: [...cls.gradeNoSchool, { date: "", label: "" }] })}
        style={{ ...btnS, width: "100%", padding: "9px" }}
      >
        {T("addDay")}
      </button>

      <button onClick={removeClass} style={{ ...btnS, width: "100%", padding: "9px", marginTop: 16, color: "#C0392B" }}>
        {T("deleteClass", cls.name)}
      </button>
    </div>
  );
}

function Settings({ school, subjects, setSubjects, classes, setClasses, activeId, setActiveId, year, cls, onClose, onReset, wide, lang, setLang }) {
  const [tab, setTab] = useState("cls");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const total = year.days.filter((d) => d.kind === "school").length;

  const editPrep = (name, text) => {
    setSubjects({
      ...subjects,
      [name]: { ...subjects[name], prep: text.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) },
    });
  };

  const addSubject = (name) => {
    if (!name || subjects[name]) return;
    const used = Object.values(subjects).map((s) => s.color);
    const color = PALETTE.find((c) => !used.includes(c)) || PALETTE[Object.keys(subjects).length % PALETTE.length];
    setSubjects({ ...subjects, [name]: { zh: "", color, prep: [] } });
  };

  const dump = JSON.stringify({ school, subjects, classes }, null, 2);

  const download = () => {
    try {
      const blob = new Blob([dump], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smis-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      alert(T("alertNoDownload"));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      alert(T("alertCopyFail"));
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(16,41,77,.4)",
        zIndex: 50,
        display: "flex",
        alignItems: wide ? "center" : "flex-end",
        justifyContent: "center",
        padding: wide ? 20 : 0,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: C.paper,
          width: "100%",
          maxWidth: wide ? 460 : "none",
          maxHeight: wide ? "84vh" : "88vh",
          borderRadius: wide ? 14 : "14px 14px 0 0",
          boxShadow: wide ? "0 18px 50px rgba(16,41,77,.28)" : "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: C.navy, flex: 1 }}>{T("settings")}</div>
          <div
            role="group"
            aria-label={T("language")}
            style={{
              display: "flex", gap: 2, padding: 2, border: `1px solid ${C.line}`,
              background: C.card, borderRadius: 8, boxSizing: "border-box",
            }}
          >
            {LANGS.map((x) => (
              <button
                key={x.id}
                onClick={() => setLang(x.id)}
                aria-pressed={lang === x.id}
                style={{
                  padding: "3px 10px", borderRadius: 6, border: "none", fontSize: 12,
                  fontWeight: 650, cursor: "pointer", fontFamily: "inherit",
                  background: lang === x.id ? C.navy : "transparent",
                  color: lang === x.id ? "#fff" : C.mute,
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ ...navBtn, width: 30, height: 30, fontSize: 15 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 14px 0" }}>
          {[["cls", T("tabClasses")], ["subj", T("tabSubjects")], ["cal", T("tabCalendar")], ["data", T("tabData")]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                padding: "6px 11px",
                borderRadius: 7,
                border: "none",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                background: tab === k ? C.navy : "transparent",
                color: tab === k ? "#fff" : C.mute,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
          {tab === "cls" && (
            <ClassEditor
              classes={classes}
              setClasses={setClasses}
              activeId={activeId}
              setActiveId={setActiveId}
              subjects={subjects}
              addSubject={addSubject}
            />
          )}

          {tab === "subj" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {Object.entries(subjects).map(([name, s]) => (
                <div key={name} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <input
                      type="color"
                      value={s.color}
                      onChange={(e) => setSubjects({ ...subjects, [name]: { ...s, color: e.target.value } })}
                      style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13.5, fontWeight: 650, color: C.navy }}>{name}</span>
                    <input
                      defaultValue={subName(s)}
                      onBlur={(e) => setSubjects({ ...subjects, [name]: { ...s, [LANG]: e.target.value } })}
                      placeholder={T("phDisplayName")}
                      style={{ ...inp, flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 12 }}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mute, marginBottom: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!s.special}
                      onChange={(e) => setSubjects({ ...subjects, [name]: { ...s, special: e.target.checked } })}
                    />
                    {T("markSpecial")}
                  </label>
                  <input
                    defaultValue={(s.prep || []).map(tx).join(T("listSep"))}
                    onBlur={(e) => editPrep(name, e.target.value)}
                    placeholder={T("phPrep")}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.6, margin: 0 }}>
                {T("subjHint")}
              </p>
            </div>
          )}

          {tab === "cal" && (
            <div style={{ fontSize: 13, color: C.navy, lineHeight: 1.7 }}>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11, marginBottom: 10 }}>
                <Row k={T("rowYear")} v={`${school.yearStart} → ${school.yearEnd}`} />
                <Row k={T("rowDays")} v={T("daysValue", total, Math.round(total / 8))} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "0 0 6px" }}>{T("noSchoolTitle")}</div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11 }}>
                {school.noSchool.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4, display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.mute, flexShrink: 0 }}>
                      {g.dates.length > 1 ? `${g.dates[0]}~${g.dates[g.dates.length - 1]}` : g.dates[0]}
                    </span>
                    <span>{tx(g.label)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "12px 0 6px" }}>
                {T("gradeOffSettings")}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11 }}>
                {cls.gradeNoSchool.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4, display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.mute, flexShrink: 0 }}>{g.date}</span>
                    <span>{tx(g.label)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "data" && (
            <div>
              <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.6, marginTop: 0 }}>
                {T("dataHint")}
              </p>

              <textarea
                value={editing ? draft : dump}
                readOnly={!editing}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%",
                  height: 260,
                  border: `1px solid ${editing ? C.navy : C.line}`,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 11,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  lineHeight: 1.5,
                  color: editing ? C.navy : "#5C6B80",
                  background: editing ? C.card : "#E7EBF1",
                  boxSizing: "border-box",
                  resize: "none",
                }}
              />

              {editing ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => onReset(draft)} style={{ ...bigBtn, background: C.navy, color: "#fff", border: "none" }}>
                    {T("saveOverwrite")}
                  </button>
                  <button onClick={() => { setDraft(dump); setEditing(false); }} style={bigBtn}>
                    {T("cancelRestore")}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setDraft(dump); setEditing(true); }}
                    style={{ ...bigBtn, background: C.navy, color: "#fff", border: "none", width: "100%", marginTop: 10 }}
                  >
                    {T("editJson")}
                  </button>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={download} style={{ ...bigBtn, fontSize: 12.5 }}>{T("download")}</button>
                    <button onClick={copy} style={{ ...bigBtn, fontSize: 12.5 }}>{copied ? T("copied") : T("copy")}</button>
                    <button onClick={() => fileRef.current?.click()} style={{ ...bigBtn, fontSize: 12.5 }}>{T("importFile")}</button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => onReset(String(r.result));
                      r.onerror = () => alert(T("alertReadFail"));
                      r.readAsText(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const bigBtn = {
  flex: 1,
  padding: "10px",
  background: C.card,
  color: C.navy,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "3px 0" }}>
    <span style={{ color: C.mute }}>{k}</span>
    <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
  </div>
);

function Footer() {
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 12,
        borderTop: `1px solid ${C.line}`,
        textAlign: "center",
        fontSize: 11,
        color: C.dim,
        lineHeight: 1.7,
      }}
    >
      <div>{T("footerNote")}</div>
      <div>
        Made by Ellen (RPJ Leo&apos;s mom) ·{" "}
        <a
          href="mailto:hinotan@gmail.com"
          style={{ color: C.mute, textDecoration: "underline" }}
        >
          {T("getInTouch")}
        </a>
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.8, marginTop: 2 }}>{T("updated", UPDATED)}</div>
    </div>
  );
}

/* ---------- 主体 ---------- */

export default function App() {
  const [school, setSchool] = useState(DEFAULT_SCHOOL);
  const [subjects, setSubjects] = useState(DEFAULT_SUBJECTS);
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  const [activeId, setActiveId] = useState("RPJ");
  const [view, setView] = useState("week");
  const [ready, setReady] = useState(false);
  const [, setSeeded] = useState(false);
  const [showSet, setShowSet] = useState(false);
  const [lang, setLang] = useState(() => detectLang());
  const fakeToday = useMemo(() => overrideToday(), []);
  const [focus, setFocus] = useState(() => overrideToday() || todayISO());
  const [jump, setJump] = useState(0);
  const stripRef = useRef(null);
  const wide = useWide();
  const urlClass = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("class");
    } catch {
      return null;
    }
  }, []);
  const scrolled = useRef(false);
  const exactAnchor = useRef(false);

  useEffect(() => {
    (async () => {
      const [s, c, sub, ui] = await Promise.all([
        store.get(KEY.school),
        store.get(KEY.classes),
        store.get(KEY.subjects),
        store.get(KEY.ui),
      ]);
      let sc = s || DEFAULT_SCHOOL;

      let cs = c && c.length ? c : DEFAULT_CLASSES;
      let sj = sub || DEFAULT_SUBJECTS;
      if (ui?.seed !== SEED) {
        // 内置日历没有对用户开放编辑，检测到旧的字符串标签就整体换成双语版
        // 校历没有对用户开放编辑入口，版本变化时整体以代码为准
        sc = DEFAULT_SCHOOL;

        DEFAULT_CLASSES.forEach((d) => {
          if (!cs.find((x) => x.id === d.id)) cs = [...cs, d];
        });
        // 内置班级的「本年级不到校」标签同样升级；用户自建的班不动
        cs = cs.map((c) => {
          const def = DEFAULT_CLASSES.find((d) => d.id === c.id);
          if (!def) return c;
          const old = typeof ((c.gradeNoSchool || [])[0] || {}).label === "string";
          return old ? { ...c, gradeNoSchool: def.gradeNoSchool } : c;
        });

        Object.entries(DEFAULT_SUBJECTS).forEach(([k, v]) => {
          if (!sj[k]) {
            sj = { ...sj, [k]: v };
            return;
          }
          const cur = sj[k];
          const merged = { ...cur };
          if (!merged.en && v.en) merged.en = v.en;
          // 用户没改过的准备物品才换成双语版
          // 用中文内容判断用户是否改过；没改过就换成最新的默认值（可能补了译文）
          const zhOf = (arr) => (arr || []).map((x) => (typeof x === "string" ? x : x.zh || x.en || "")).join("、");
          if (zhOf(cur.prep) === zhOf(v.prep)) merged.prep = v.prep;
          sj = { ...sj, [k]: merged };
        });
      }
      setSchool(sc);
      setClasses(cs);
      setSubjects(sj);
      const fromUrl = urlClass && cs.find((x) => x.id.toLowerCase() === urlClass.trim().toLowerCase());
      if (fromUrl) setActiveId(fromUrl.id);
      else if (ui?.activeId && cs.find((x) => x.id === ui.activeId)) setActiveId(ui.activeId);
      // 语言优先级：URL ?lang= > 本地记录 > 浏览器语言
      try {
        const q = new URLSearchParams(window.location.search).get("lang");
        if (!(q && LOCALES[q.toLowerCase()]) && ui?.lang && LOCALES[ui.lang]) setLang(ui.lang);
      } catch {}
      setSeeded(true);
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) store.set(KEY.subjects, subjects); }, [subjects, ready]);
  useEffect(() => { if (ready) store.set(KEY.classes, classes); }, [classes, ready]);
  useEffect(() => { if (ready) store.set(KEY.school, school); }, [school, ready]);
  useEffect(() => { if (ready) store.set(KEY.ui, { activeId, lang, seed: SEED }); }, [activeId, lang, ready]);

  // 把当前班级写回 URL，方便分享和收藏
  useEffect(() => {
    if (!ready) return;
    try {
      const u = new URL(window.location.href);
      let changed = false;
      if (u.searchParams.get("class") !== activeId) {
        u.searchParams.set("class", activeId);
        changed = true;
      }
      if (u.searchParams.get("lang") !== lang) {
        u.searchParams.set("lang", lang);
        changed = true;
      }
      if (changed) window.history.replaceState(null, "", u.toString());
    } catch {}
  }, [activeId, lang, ready]);

  // 渲染开头设定当前语言，子组件通过 T() / tx() 读取，不必层层传 prop
  LANG = lang;

  const year = useMemo(() => buildYear(school), [school]);
  const cls = classes.find((c) => c.id === activeId) || classes[0];
  const today = fakeToday || todayISO();

  // 标签页标题跟着班级走
  useEffect(() => {
    if (!cls) return;
    const yr = `${school.yearStart.slice(2, 4)}-${school.yearEnd.slice(2, 4)}`;
    try {
      document.title = `🗓️${cls.name} - SMIS ${yr}`;
    } catch {}
  }, [cls, school]);

  // 横向滚动条放工作日；有活动的周末插入一张合并卡片
  const strip = useMemo(() => {
    const out = [];
    let pend = [];
    year.days.forEach((d) => {
      if (d.kind === "weekend") {
        if (d.events.length) pend.push(d);
        return;
      }
      if (pend.length) {
        out.push({ kind: "weekendGroup", date: pend[0].date, days: pend });
        pend = [];
      }
      out.push(d);
    });
    if (pend.length) out.push({ kind: "weekendGroup", date: pend[0].date, days: pend });
    return out;
  }, [year]);

  // 桌面端按「页」翻：每周一页（周一–周五）；那周后面有周末卡时，
  // 额外插一页（周二–周末卡），再往后又回到下周一对齐
  const pages = useMemo(() => {
    const out = [];
    let i = 0;
    while (i < strip.length) {
      if (strip[i].kind === "weekendGroup") {
        i++;
        continue;
      }
      out.push(i);
      let j = i + 1;
      while (j < strip.length && strip[j].kind !== "weekendGroup" && strip[j].dow !== 1) j++;
      if (j < strip.length && strip[j].kind === "weekendGroup") {
        out.push(Math.max(0, j - 4));
        j++;
      }
      i = j;
    }
    return out;
  }, [strip]);

  // 只渲染焦点附近的日子，滑到边缘再延展 —— 全年 176 天一次性渲染在手机上会卡
  const [range, setRange] = useState({ lo: 0, hi: 40 });

  useEffect(() => {
    if (!ready || view !== "week" || !strip.length) return;
    const i = strip.findIndex((d) => d.date >= focus);
    let idx = i < 0 ? Math.max(0, strip.length - 2) : i;
    // 桌面端落点对齐到整周页首；箭头翻页已经给了精确页首，不再重映射
    if (wide && !exactAnchor.current && pages.length) {
      const pi = pages.findIndex((x) => idx >= x && idx <= x + 4);
      if (pi >= 0) idx = pages[pi];
    }
    exactAnchor.current = false;
    setRange({ lo: Math.max(0, idx - 8), hi: Math.min(strip.length, idx + 32) });
    scrolled.current = idx;
  }, [focus, jump, ready, view, strip, wide, pages]);

  useEffect(() => {
    if (view !== "week" || typeof scrolled.current !== "number") return;
    const el = stripRef.current;
    const child = el?.children[scrolled.current - range.lo];
    if (child) {
      try {
        child.scrollIntoView({ inline: "start", block: "nearest" });
      } catch {
        if (el) el.scrollLeft = child.offsetLeft;
      }
      scrolled.current = null;
    }
  }, [range, view]);

  // 统一的跳转入口。focus 可能和当前值相同（例如反复点「回到今天」），
  // 所以另外用一个计数器强制触发 effect。
  const goToDate = useCallback((d, exact) => {
    exactAnchor.current = !!exact;
    setFocus(d);
    setJump((j) => j + 1);
  }, []);

  const gotoPage = useCallback(
    (dir) => {
      const el = stripRef.current;
      if (!el || !pages.length) return;
      const w = el.children[0]?.getBoundingClientRect().width || 0;
      const cur = w ? range.lo + Math.round(el.scrollLeft / (w + 8)) : range.lo;

      let pi = pages.indexOf(cur);
      if (pi < 0) pi = pages.findIndex((x) => cur >= x && cur <= x + 4);
      if (pi < 0) {
        pi = 0;
        for (let k = 0; k < pages.length; k++) if (pages[k] <= cur) pi = k;
      }
      const nx = Math.min(pages.length - 1, Math.max(0, pi + dir));
      const target = strip[pages[nx]];
      if (target) goToDate(target.date, true);
    },
    [pages, strip, range.lo, goToDate]
  );

  const onStripScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - 60) {
        setRange((r) => (r.hi >= strip.length ? r : { ...r, hi: Math.min(strip.length, r.hi + 20) }));
      } else if (el.scrollLeft < 60 && range.lo > 0) {
        const add = Math.min(20, range.lo);
        const w = el.children[0]?.getBoundingClientRect().width || 0;
        setRange((r) => ({ ...r, lo: Math.max(0, r.lo - add) }));
        requestAnimationFrame(() => { el.scrollLeft += add * (w + 8); });
      }
    },
    [strip.length, range.lo]
  );

  const [month, setMonth] = useState(() => {
    const d = parse(today >= school.yearStart && today <= school.yearEnd ? today : school.yearStart);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 下一个该班到校的日子
  const nextDay = useMemo(() => {
    for (const d of year.days) {
      if (d.date < today || d.kind !== "school") continue;
      const r = dayForClass(d, cls);
      if (!r.classOff) return r;
    }
    return null;
  }, [year, cls, today]);

  // 周末/假期时今天不在周视图里，高亮就落到下次上学那天
  const highlightDate = useMemo(
    () => (strip.some((d) => d.date === today && d.kind !== "weekendGroup") ? today : nextDay ? nextDay.date : null),
    [strip, today, nextDay]
  );

  // 提醒条右栏：nextDay 之后的下一个到校日
  const dayAfter = useMemo(() => {
    if (!nextDay) return null;
    for (const d of year.days) {
      if (d.date <= nextDay.date || d.kind !== "school") continue;
      const r = dayForClass(d, cls);
      if (!r.classOff) return r;
    }
    return null;
  }, [year, cls, nextDay]);

  const todayRec = year.byDate.get(today);
  const inYear = today >= school.yearStart && today <= school.yearEnd;

  const importJSON = (txt) => {
    try {
      const o = JSON.parse(txt);
      if (o.school) setSchool(o.school);
      if (o.subjects) setSubjects(o.subjects);
      if (o.classes?.length) {
        setClasses(o.classes);
        if (!o.classes.find((c) => c.id === activeId)) setActiveId(o.classes[0].id);
      }
      setShowSet(false);
    } catch {
      alert(T("alertBadJson"));
    }
  };

  if (!ready) {
    return (
      <div style={{ ...shell, maxWidth: 560, alignItems: "center", justifyContent: "center", display: "flex", color: C.mute, fontSize: 13 }}>
        {T("loading")}
      </div>
    );
  }

  return (
    <div style={{ ...shell, maxWidth: wide ? 1040 : 560 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder, textarea::placeholder { color: #AFBAC8; opacity: 1; }
        input::-webkit-input-placeholder, textarea::-webkit-input-placeholder { color: #AFBAC8; }
        button:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
        .strip::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
      `}</style>

      {/* 顶栏 */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: C.paper, paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0 9px" }}>
          {inYear && todayRec?.kind === "school" ? (
            <Letter letter={todayRec.letter} size={40} />
          ) : (
            <RestChip size={40} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, lineHeight: 1.2 }}>
              {inYear && todayRec?.kind === "school" ? T("todayIs", todayRec.letter) : T("todayOff")}
            </div>
            <div style={{ fontSize: 11.5, color: C.mute }}>
              {T("dateWd", parse(today))} · {cls.name}
            </div>
          </div>
          <button onClick={() => setShowSet(true)} style={{ ...navBtn, fontSize: 15 }}>⚙</button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <div
            role="group"
            style={{
              display: "flex",
              gap: 2,
              padding: 2,
              border: `1px solid ${C.line}`,
              background: C.card,
              borderRadius: 8,
              boxSizing: "border-box",
            }}
          >
            {[["week", T("viewWeek")], ["month", T("viewMonth")]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                aria-pressed={view === k}
                style={{
                  padding: "3px 15px", borderRadius: 6, border: "none", fontSize: 12.5,
                  fontWeight: 650, cursor: "pointer", fontFamily: "inherit",
                  background: view === k ? C.navy : "transparent",
                  color: view === k ? "#fff" : C.mute,
                  transition: "background .12s, color .12s",
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {view === "week" && (
            <button
              onClick={() => goToDate(today)}
              style={{
                padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.line}`,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                background: C.card, color: C.navy, marginLeft: "auto",
              }}
            >
              {T("backToToday")}
            </button>
          )}
          {classes.length > 1 ? (
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              style={{
                marginLeft: "auto", border: `1px solid ${C.line}`, borderRadius: 7,
                background: C.card, color: C.navy, fontSize: 12.5, fontWeight: 600,
                padding: "5px 8px", fontFamily: "inherit",
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setShowSet(true)}
              style={{
                marginLeft: "auto", border: `1px solid ${C.line}`, borderRadius: 7,
                background: C.card, color: C.mute, fontSize: 12.5, fontWeight: 600,
                padding: "5px 10px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {cls.name} ▾
            </button>
          )}
        </div>
      </div>

      {fakeToday && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            background: C.gold + "26", border: `1px solid ${C.gold}77`,
            borderRadius: 9, padding: "7px 10px", fontSize: 12, color: "#8A6410",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            {T("previewMode", fakeToday)}
          </span>
          <button
            onClick={() => {
              try {
                const u = new URL(window.location.href);
                u.searchParams.delete("day");
                window.location.href = u.toString();
              } catch {}
            }}
            style={{
              border: `1px solid ${C.gold}`, background: "transparent", color: "#8A6410",
              borderRadius: 6, fontSize: 11.5, fontWeight: 600, padding: "3px 9px",
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            {T("exit")}
          </button>
        </div>
      )}

      <PrepBanner rec={nextDay} next={dayAfter} cls={cls} subjects={subjects} today={today} />

      {view === "week" ? (
        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          {wide && (
            <button onClick={() => gotoPage(-1)} style={arrowBtn} aria-label={T("prevPage")}>‹</button>
          )}
          <div
            ref={stripRef}
            className="strip"
            onScroll={onStripScroll}
            style={{
              display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory",
              paddingBottom: 20, msOverflowStyle: "none", scrollbarWidth: "none", flex: 1, minWidth: 0,
            }}
          >
          {strip.slice(range.lo, range.hi).map((raw) => {
            if (raw.kind === "weekendGroup") {
              return (
                <div
                  key={raw.date}
                  style={{
                    flex: wide ? "0 0 calc(20% - 6.4px)" : "0 0 calc(50% - 4px)",
                    minWidth: wide ? 0 : 156,
                    scrollSnapAlign: "start",
                    boxSizing: "border-box",
                  }}
                >
                  <WeekendCard item={raw} isToday={raw.days.some((d) => d.date === today)} />
                </div>
              );
            }
            const rec = dayForClass(raw, cls);
            const rel =
              rec.date === today ? T("relToday") :
              nextDay && rec.date === nextDay.date && rec.date > today ? T("relNext") : null;
            return (
              <div
                key={rec.date}
                style={{
                  flex: wide ? "0 0 calc(20% - 6.4px)" : "0 0 calc(50% - 4px)",
                  minWidth: wide ? 0 : 156,
                  scrollSnapAlign: "start",
                  boxSizing: "border-box",
                  borderLeft: !wide && rec.dow === 1 ? `2px solid ${C.line}` : "none",
                  paddingLeft: !wide && rec.dow === 1 ? 6 : 0,
                }}
              >
                <DayCard rec={rec} cls={cls} subjects={subjects} relLabel={rel} isToday={rec.date === highlightDate} />
                {rec.holiday && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 5,
                      marginTop: 6,
                      fontSize: 10.5,
                      color: C.mute,
                      lineHeight: 1.45,
                    }}
                  >
                    <span
                      style={{
                        width: 5, height: 5, borderRadius: 5, background: "#D93E4A",
                        flexShrink: 0, marginTop: 4,
                      }}
                    />
                    <span style={{ minWidth: 0 }}>
                      {T("jpHoliday")} · {tx(rec.holiday)}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {wide && (
            <button onClick={() => gotoPage(1)} style={arrowBtn} aria-label={T("nextPage")}>›</button>
          )}
        </div>
      ) : (
        <MonthView
          year={year} cls={cls} subjects={subjects} month={month} setMonth={setMonth} wide={wide} today={today}
          onPick={(d) => { goToDate(d); setView("week"); }}
        />
      )}

      <Footer />

      {showSet && (
        <Settings
          school={school} subjects={subjects} setSubjects={setSubjects}
          classes={classes} setClasses={setClasses}
          activeId={activeId} setActiveId={setActiveId} year={year} cls={cls}
          onClose={() => setShowSet(false)} onReset={importJSON} wide={wide}
          lang={lang} setLang={setLang}
        />
      )}
    </div>
  );
}

const arrowBtn = {
  flex: "0 0 34px",
  alignSelf: "center",
  height: 60,
  border: `1px solid ${C.line}`,
  background: C.card,
  borderRadius: 9,
  color: C.navy,
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
};

const shell = {
  minHeight: "100vh",
  background: C.paper,
  padding: "0 12px 24px",
  fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans SC', sans-serif",
  color: C.navy,
  margin: "0 auto",
};
