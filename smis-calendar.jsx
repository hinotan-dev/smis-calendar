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
    { dates: ["2026-09-21"], label: "Back to School（仅家长）" },
    { dates: expand("2026-10-12", "2026-10-16"), label: "秋假" },
    { dates: ["2026-11-03"], label: "PTC（仅家长）" },
    { dates: ["2026-11-23"], label: "教师培训日" },
    { dates: ["2026-11-27"], label: "感恩节" },
    { dates: expand("2026-12-18", "2027-01-05"), label: "圣诞假期" },
    { dates: ["2027-01-11"], label: "教师培训日" },
    { dates: ["2027-02-11"], label: "学生主导 PTC" },
    { dates: ["2027-02-19"], label: "教师培训日" },
    { dates: expand("2027-02-22", "2027-02-23"), label: "冬假" },
    { dates: expand("2027-03-22", "2027-03-26"), label: "春假" },
    { dates: ["2027-05-03"], label: "公共假日" },
    { dates: ["2027-05-10"], label: "Carnival 补休" },
  ],
  // PDF 上带 ✱ 星标的日子
  holidays: [
    { date: "2026-09-21", label: "敬老の日" },
    { date: "2026-09-22", label: "国民の休日" },
    { date: "2026-09-23", label: "秋分の日" },
    { date: "2026-10-12", label: "スポーツの日" },
    { date: "2026-11-03", label: "文化の日" },
    { date: "2026-11-23", label: "勤労感謝の日" },
    { date: "2027-01-01", label: "元日" },
    { date: "2027-01-11", label: "成人の日" },
    { date: "2027-02-11", label: "建国記念の日" },
    { date: "2027-02-23", label: "天皇誕生日" },
    { date: "2027-03-20", label: "春分の日" },
    { date: "2027-04-29", label: "昭和の日" },
    { date: "2027-05-03", label: "憲法記念日" },
    { date: "2027-05-04", label: "みどりの日" },
    { date: "2027-05-05", label: "こどもの日" },
  ],
  events: [
    { date: "2026-08-24", label: "G3–12 开学" },
    { date: "2026-08-25", label: "RP–G2 开学" },
    { date: "2026-10-23", label: "Q1 结束" },
    { date: "2026-11-13", label: "Fall Play" },
    { date: "2026-11-14", label: "Fall Play" },
    { date: "2026-11-20", label: "Bingo" },
    { date: "2026-12-05", label: "ES Choral Christmas Concert" },
    { date: "2026-12-06", label: "MS/HS Choral Christmas Concert" },
    { date: "2026-12-08", label: "St. Mary's Day 庆典" },
    { date: "2026-12-09", label: "Winter Instrumental Concert" },
    { date: "2027-01-22", label: "Q2 / S1 结束" },
    { date: "2027-02-06", label: "Jazz Concert" },
    { date: "2027-02-18", label: "The JAM Show" },
    { date: "2027-04-02", label: "Q3 结束" },
    { date: "2027-04-09", label: "Spring Musical" },
    { date: "2027-04-10", label: "Spring Musical" },
    { date: "2027-04-11", label: "Spring Musical" },
    { date: "2027-04-23", label: "MS/HS Spring Choral Concert" },
    { date: "2027-05-08", label: "Carnival" },
    { date: "2027-05-21", label: "Spring Instrumental Concert" },
    { date: "2027-05-27", label: "ES Spring Choral Concert" },
    { date: "2027-05-29", label: "HS 毕业典礼" },
    { date: "2027-06-09", label: "ES Sports Day" },
    { date: "2027-06-10", label: "Jazz Nite" },
    { date: "2027-06-11", label: "最后一天 · 11:30 放学" },
  ],
};

const DEFAULT_SUBJECTS = {
  ELA: { zh: "英语语文", color: "#4A6FA5" },
  MATH: { zh: "数学", color: "#2E8B6F" },
  "SS/SCI": { zh: "社会 / 科学", color: "#6B8E23" },
  REL: { zh: "宗教", color: "#8C7B5A" },
  CORE: { zh: "核心课", color: "#5A6B7B" },
  JPN: { zh: "日语", color: "#C79A2E" },
  ART: { zh: "美术", color: "#C2652A", special: true, prep: ["罩衫"] },
  PE: { zh: "体育", color: "#D93E4A", special: true, prep: ["运动服"] },
  SWIM: { zh: "游泳", color: "#1E9BC4", special: true, prep: ["泳衣", "泳镜", "浴巾"] },
  LIB: { zh: "图书馆", color: "#7B5EA7", special: true, prep: ["还书"] },
  MUS: { zh: "音乐", color: "#B8478E", special: true, prep: [] },
  "Home Room / Prayer": { zh: "晨会 / 祈祷", color: C.dim, break: true },
  Recess: { zh: "课间", color: C.dim, break: true },
  "Lunch / Recess": { zh: "午餐 / 课间", color: C.dim, break: true },
};

const RPJ = {
  id: "RPJ",
  name: "RPJ",
  grade: "RP",
  gradeNoSchool: [
    { date: "2026-08-24", label: "RP–G2 晚一天开学" },
    { date: "2027-06-07", label: "仅 ES 放假（MS/HS 照常）" },
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

const DEFAULT_CLASSES = [RPJ, RPY];

// 递增这个数字，下次载入会补进新增的默认班级/科目，但不覆盖你改过的内容
const SEED = 6;
const LABEL_FIXES = {
  "Back to School Day（仅家长）": "Back to School（仅家长）",
  "Parent Teacher Conference（仅家长）": "PTC（仅家长）",
  "Professional Development Day": "教师培训日",
  "PD Day": "教师培训日",
  "宪法纪念日": "公共假日",
  "Student Led & Parent Teacher Conference": "学生主导 PTC",
  "Carnival Recovery Day": "Carnival 补休",
};
const RETIRED_PREP = { PE: "运动鞋、运动服、水壶", SWIM: "泳衣、泳帽、泳镜、浴巾", LIB: "还上次借的书" };

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
      休
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
          {isBreak ? s.zh : name}
        </div>
        {!isBreak && s.zh && (
          <div style={{ fontSize: 11, color: C.mute, lineHeight: 1.3 }}>{s.zh}</div>
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
              周{WD[rec.dow]}
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
          {rec.events.join(" · ")}
        </div>
      )}

      {off ? (
        <div style={{ fontSize: 12.5, color: C.mute, padding: "10px 2px", lineHeight: 1.5 }}>
          {rec.kind === "weekend" ? "周末" : `放假 — ${rec.reason}`}
        </div>
      ) : classOff ? (
        <div style={{ fontSize: 12.5, color: C.mute, padding: "8px 2px", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: C.navy }}>本年级不到校</div>
          <div style={{ marginTop: 2 }}>{classOff}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
            轮换照常推进，这天仍算 {rec.letter} DAY
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
          <div style={{ fontSize: 15, fontWeight: 650, color: C.navy }}>周末活动</div>
        </div>
        <RestChip />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {item.days.map((d) => (
          <div key={d.date}>
            <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10.5, color: C.mute, marginBottom: 3 }}>
              {parse(d.date).getMonth() + 1}/{parse(d.date).getDate()} 周{WD[d.dow]}
            </div>
            {d.events.map((ev, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12, color: "#8A6410", background: C.gold + "26",
                  borderRadius: 5, padding: "4px 7px", marginBottom: 3, lineHeight: 1.4,
                }}
              >
                {ev}
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
    rec.date === today ? "今天" : rec.date === iso(tmr) ? "明天" : `${d.getMonth() + 1}/${d.getDate()}（周${WD[d.getDay()]}）`;

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
        <span style={{ minWidth: 0 }}>{when}要带 · {rec.letter} day</span>
      </div>

      {items.length ? (
        items.map((it) => (
          <div key={it.name} style={{ display: "flex", gap: 7, alignItems: "baseline", marginTop: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: it.color, flexShrink: 0 }}>{it.name}</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, minWidth: 0 }}>{it.prep.join(" · ")}</span>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, opacity: 0.72 }}>没有要特别准备的东西</div>
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
          {month.y} 年 {month.m + 1} 月
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
        {["一", "二", "三", "四", "五"].map((x) => (
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
                      {key === today && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>
                          今天
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
                    {rec?.classOff && <Chip bg="#C6CFDC" fg="#41546E">本年级休</Chip>}
                    {rec?.kind === "off" && <Chip bg="#CFD8E3" fg="#41546E">{rec.reason}</Chip>}
                    {rec?.events?.map((ev, i) => (
                      <Chip key={i} bg={C.gold + "33"} fg="#8A6410">{ev}</Chip>
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
            本月周末活动
          </div>
          {weekendEvents.map((d) => (
            <div key={d.date} style={{ display: "flex", gap: 9, alignItems: "baseline", marginBottom: 5 }}>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 11.5, color: "#A57A18", flexShrink: 0, minWidth: 62,
                }}
              >
                {parse(d.date).getMonth() + 1}/{parse(d.date).getDate()} 周{WD[d.dow]}
              </span>
              <span style={{ fontSize: 12.5, color: "#6E4E08", fontWeight: 550, lineHeight: 1.45 }}>
                {d.events.join(" · ")}
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
      <option value="__new__">＋ 新科目…</option>
    </select>
  );
}

function BlockRow({ block, subjects, onChange, onRemove, onMove, addSubject }) {
  const rotating = typeof block.subject !== "string";
  const newSubj = (apply) => {
    const name = window.prompt("新科目名称（例如 DRAMA）");
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
        按 A–H 轮换（不勾则每天相同）
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
    const name = window.prompt("新班级名称（例如 RPK 或 1A）");
    if (!name) return;
    const id = name.trim();
    if (classes.find((c) => c.id === id)) return alert("这个名称已经存在了。");
    const base = copyFrom
      ? { ...cls, blocks: JSON.parse(JSON.stringify(cls.blocks)), gradeNoSchool: [...cls.gradeNoSchool] }
      : { grade: "", gradeNoSchool: [], blocks: [{ label: "P1", start: "08:30", end: "10:00", subject: "ELA" }] };
    setClasses([...classes, { ...base, id, name: id }]);
    setEditId(id);
  };

  const removeClass = () => {
    if (classes.length < 2) return alert("至少要保留一个班级。");
    if (!window.confirm(`删除 ${cls.name}？`)) return;
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
        <button onClick={() => addClass(false)} style={{ ...btnS, color: C.mute }}>＋ 空白</button>
        <button onClick={() => addClass(true)} style={{ ...btnS, color: C.mute }}>＋ 复制当前</button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <input value={cls.name} onChange={(e) => patch({ name: e.target.value })} placeholder="班级名" style={{ ...inp, flex: 2, minWidth: 0 }} />
        <input value={cls.grade} onChange={(e) => patch({ grade: e.target.value })} placeholder="年级" style={{ ...inp, flex: 1, minWidth: 0 }} />
        <button
          onClick={() => { setActiveId(cls.id); }}
          style={{ ...btnS, background: activeId === cls.id ? "#DFE5EE" : C.card, whiteSpace: "nowrap" }}
        >
          {activeId === cls.id ? "显示中" : "切到这个"}
        </button>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, marginBottom: 6 }}>课表时段</div>
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
        ＋ 加一个时段
      </button>

      <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "16px 0 6px" }}>
        本年级不到校的日子（轮换照常推进）
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
            value={g.label}
            onChange={(e) => patch({ gradeNoSchool: cls.gradeNoSchool.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
            placeholder="原因"
            style={{ ...inp, flex: 1.3, minWidth: 0 }}
          />
          <button onClick={() => patch({ gradeNoSchool: cls.gradeNoSchool.filter((_, j) => j !== i) })} style={{ ...btnS, color: "#C0392B" }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => patch({ gradeNoSchool: [...cls.gradeNoSchool, { date: "", label: "" }] })}
        style={{ ...btnS, width: "100%", padding: "9px" }}
      >
        ＋ 加一天
      </button>

      <button onClick={removeClass} style={{ ...btnS, width: "100%", padding: "9px", marginTop: 16, color: "#C0392B" }}>
        删除 {cls.name}
      </button>
    </div>
  );
}

function Settings({ school, subjects, setSubjects, classes, setClasses, activeId, setActiveId, year, cls, onClose, onReset, wide }) {
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
      alert("这个环境不支持下载，可以改用「复制」。");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      alert("复制失败，可以手动全选文本框里的内容。");
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
          <div style={{ fontSize: 15, fontWeight: 650, color: C.navy, flex: 1 }}>设置</div>
          <button onClick={onClose} style={{ ...navBtn, width: 30, height: 30, fontSize: 15 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 14px 0" }}>
          {[["cls", "班级"], ["subj", "科目"], ["cal", "校历"], ["data", "数据"]].map(([k, l]) => (
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
                      defaultValue={s.zh || ""}
                      onBlur={(e) => setSubjects({ ...subjects, [name]: { ...s, zh: e.target.value } })}
                      placeholder="中文名"
                      style={{ ...inp, flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 12 }}
                    />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mute, marginBottom: 6, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!s.special}
                      onChange={(e) => setSubjects({ ...subjects, [name]: { ...s, special: e.target.checked } })}
                    />
                    高亮为 special 课
                  </label>
                  <input
                    defaultValue={(s.prep || []).join("、")}
                    onBlur={(e) => editPrep(name, e.target.value)}
                    placeholder="要带的东西，用顿号分隔"
                    style={{ ...inp, width: "100%" }}
                  />
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.6, margin: 0 }}>
                改完点一下别处保存。填了物品的科目会出现在顶部提醒条里。
              </p>
            </div>
          )}

          {tab === "cal" && (
            <div style={{ fontSize: 13, color: C.navy, lineHeight: 1.7 }}>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11, marginBottom: 10 }}>
                <Row k="学年" v={`${school.yearStart} → ${school.yearEnd}`} />
                <Row k="上课日" v={`${total} 天（${Math.round(total / 8)} 轮 A–H 循环）`} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "0 0 6px" }}>不上课日（跳过轮换）</div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11 }}>
                {school.noSchool.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4, display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.mute, flexShrink: 0 }}>
                      {g.dates.length > 1 ? `${g.dates[0]}~${g.dates[g.dates.length - 1]}` : g.dates[0]}
                    </span>
                    <span>{g.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, margin: "12px 0 6px" }}>
                本年级不到校（轮换照常）
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: 11 }}>
                {cls.gradeNoSchool.map((g, i) => (
                  <div key={i} style={{ fontSize: 12, marginBottom: 4, display: "flex", gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.mute, flexShrink: 0 }}>{g.date}</span>
                    <span>{g.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "data" && (
            <div>
              <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.6, marginTop: 0 }}>
                这是全部设置的完整备份。下载或复制一份保存起来；换设备、换浏览器、或者明年新学年时，从这里导回去。
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
                    保存并覆盖
                  </button>
                  <button onClick={() => { setDraft(dump); setEditing(false); }} style={bigBtn}>
                    取消并还原
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setDraft(dump); setEditing(true); }}
                    style={{ ...bigBtn, background: C.navy, color: "#fff", border: "none", width: "100%", marginTop: 10 }}
                  >
                    编辑 JSON
                  </button>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={download} style={{ ...bigBtn, fontSize: 12.5 }}>下载文件</button>
                    <button onClick={copy} style={{ ...bigBtn, fontSize: 12.5 }}>{copied ? "已复制" : "复制"}</button>
                    <button onClick={() => fileRef.current?.click()} style={{ ...bigBtn, fontSize: 12.5 }}>导入文件</button>
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
                      r.onerror = () => alert("读取文件失败。");
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
        // 只把已知的旧标签换成简写，你自己写的标签不动
        sc = {
          ...sc,
          holidays: sc.holidays && sc.holidays.length ? sc.holidays : DEFAULT_SCHOOL.holidays,
          noSchool: sc.noSchool.map((g) => (LABEL_FIXES[g.label] ? { ...g, label: LABEL_FIXES[g.label] } : g)),
        };
        // 只补不覆盖：加进缺少的默认班级和科目
        DEFAULT_CLASSES.forEach((d) => {
          if (!cs.find((x) => x.id === d.id)) cs = [...cs, d];
        });
        Object.entries(DEFAULT_SUBJECTS).forEach(([k, v]) => {
          if (!sj[k]) sj = { ...sj, [k]: v };
        });
        // 准备物品只在你没改过的情况下更新
        Object.entries(RETIRED_PREP).forEach(([k, oldVal]) => {
          if (sj[k] && (sj[k].prep || []).join("、") === oldVal) {
            sj = { ...sj, [k]: { ...sj[k], prep: DEFAULT_SUBJECTS[k].prep } };
          }
        });
      }
      setSchool(sc);
      setClasses(cs);
      setSubjects(sj);
      const fromUrl = urlClass && cs.find((x) => x.id.toLowerCase() === urlClass.trim().toLowerCase());
      if (fromUrl) setActiveId(fromUrl.id);
      else if (ui?.activeId && cs.find((x) => x.id === ui.activeId)) setActiveId(ui.activeId);
      setSeeded(true);
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) store.set(KEY.subjects, subjects); }, [subjects, ready]);
  useEffect(() => { if (ready) store.set(KEY.classes, classes); }, [classes, ready]);
  useEffect(() => { if (ready) store.set(KEY.school, school); }, [school, ready]);
  useEffect(() => { if (ready) store.set(KEY.ui, { activeId, seed: SEED }); }, [activeId, ready]);

  // 把当前班级写回 URL，方便分享和收藏
  useEffect(() => {
    if (!ready) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("class") !== activeId) {
        u.searchParams.set("class", activeId);
        window.history.replaceState(null, "", u.toString());
      }
    } catch {}
  }, [activeId, ready]);

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
      alert("JSON 格式有误，检查一下括号和引号。");
    }
  };

  if (!ready) {
    return (
      <div style={{ ...shell, maxWidth: 560, alignItems: "center", justifyContent: "center", display: "flex", color: C.mute, fontSize: 13 }}>
        载入中…
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
              {inYear && todayRec?.kind === "school" ? `今天是 ${todayRec.letter} DAY` : "今天不上课"}
            </div>
            <div style={{ fontSize: 11.5, color: C.mute }}>
              {parse(today).getMonth() + 1}/{parse(today).getDate()} 周{WD[parse(today).getDay()]} · {cls.name}
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
            {[["week", "周"], ["month", "月"]].map(([k, l]) => (
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
              回到今天
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
            预览模式 · 把 {fakeToday} 当作今天
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
            退出
          </button>
        </div>
      )}

      <PrepBanner rec={nextDay} next={dayAfter} cls={cls} subjects={subjects} today={today} />

      {view === "week" ? (
        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          {wide && (
            <button onClick={() => gotoPage(-1)} style={arrowBtn} aria-label="上一页">‹</button>
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
              rec.date === today ? "今天" :
              nextDay && rec.date === nextDay.date && rec.date > today ? "下次上学" : null;
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
                      alignItems: "center",
                      gap: 5,
                      marginTop: 6,
                      fontSize: 10.5,
                      color: C.mute,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: 5, background: "#D93E4A", flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      日本公共假日 · {rec.holiday}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {wide && (
            <button onClick={() => gotoPage(1)} style={arrowBtn} aria-label="下一页">›</button>
          )}
        </div>
      ) : (
        <MonthView
          year={year} cls={cls} subjects={subjects} month={month} setMonth={setMonth} wide={wide} today={today}
          onPick={(d) => { goToDate(d); setView("week"); }}
        />
      )}

      {showSet && (
        <Settings
          school={school} subjects={subjects} setSubjects={setSubjects}
          classes={classes} setClasses={setClasses}
          activeId={activeId} setActiveId={setActiveId} year={year} cls={cls}
          onClose={() => setShowSet(false)} onReset={importJSON} wide={wide}
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
