/**
 * SMIS 课表 — 回归测试
 *
 *   npm i -D jsdom
 *   node test.js
 *
 * 直接跑打包后的 index.html（也就是部署上去的那个文件），
 * 不依赖构建流程。任何一项失败退出码为 1。
 */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const NAVY = "#10294D";

/* ---------------- 断言 ---------------- */

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed++;
  } else {
    failures.push(detail ? `${name}  →  ${detail}` : name);
  }
}
const eq = (name, actual, expected) =>
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);

/* ---------------- 启动一个实例 ---------------- */

function boot({ url = "https://x.test/?class=RPJ", store = {}, wide = false, settle = 700 } = {}) {
  return new Promise((resolve) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => errors.push(e.message));
    vc.on("error", (...a) => errors.push(a.join(" ")));

    const dom = new JSDOM(HTML, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: vc,
      url,
    });
    const w = dom.window;
    const doc = w.document;

    // jsdom 没有布局引擎，补上测试需要的部分
    w.Element.prototype.getBoundingClientRect = function () {
      const isCard = this.style && this.style.scrollSnapAlign === "start";
      return { width: isCard ? 180 : 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    };
    const scrollTargets = [];
    w.Element.prototype.scrollIntoView = function () {
      scrollTargets.push(this.textContent.trim().replace(/\s+/g, ""));
      const par = this.parentElement;
      if (par) par.scrollLeft = [...par.children].indexOf(this) * 188;
    };
    w.Element.prototype.scrollBy = function () {};
    w.matchMedia = (q) => ({
      matches: wide && /min-width/.test(q),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
    w.URL.createObjectURL = () => "blob:test";
    w.URL.revokeObjectURL = () => {};
    w.alert = (m) => errors.push("alert: " + m);

    const mem = { ...store };
    w.storage = {
      get: async (k) => {
        if (mem[k] === undefined) throw new Error("missing");
        return { key: k, value: mem[k] };
      },
      set: async (k, v) => {
        mem[k] = v;
        return { key: k, value: v };
      },
    };

    setTimeout(() => {
      const ctx = {
        w,
        doc,
        errors,
        scrollTargets,
        mem,
        root: () => doc.getElementById("root"),
        text: () => doc.getElementById("root").textContent,
        buttons: () => [...doc.querySelectorAll("button")],
        btn: (label) => ctx.buttons().find((b) => b.textContent.trim() === label),
        click: async (label) => {
          const b = ctx.btn(label);
          if (!b) throw new Error("找不到按钮: " + label);
          b.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
          await pause(200);
        },
        band: () =>
          [...doc.querySelectorAll("div")].find(
            (x) => x.style.background === "rgb(16, 41, 77)" && x.style.marginBottom === "10px"
          ),
        cards: () => [...doc.querySelectorAll("div")].filter((x) => x.style.scrollSnapAlign === "start"),
        monthCells: () => ctx.buttons().filter((b) => b.style.boxSizing === "border-box" && b.style.height),
      };
      resolve(ctx);
    }, settle);
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 对比度 ---------------- */

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const relLum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const l1 = relLum(hex2rgb(a));
  const l2 = relLum(hex2rgb(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
const rgbToHex = (s) =>
  "#" + s.match(/\d+/g).slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");

/* ---------------- 轮换独立复算 ---------------- */
/* 不信任 app 自己算的结果，用它导出的数据在测试里重算一遍 */

function recomputeRotation(school) {
  const LET = "ABCDEFGH";
  const off = new Set();
  school.noSchool.forEach((g) => g.dates.forEach((d) => off.add(d)));
  const out = new Map();
  const d = new Date(school.yearStart + "T00:00:00");
  const end = new Date(school.yearEnd + "T00:00:00");
  let i = 0;
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() > 0 && d.getDay() < 6 && !off.has(iso)) {
      out.set(iso, LET[i % 8]);
      i++;
    }
    d.setDate(d.getDate() + 1);
  }
  return { map: out, total: i };
}

async function exportedData(ctx) {
  await ctx.click("⚙");
  await ctx.click("数据");
  const ta = ctx.doc.querySelector("textarea");
  return JSON.parse(ta.value);
}

/* ---------------- 测试 ---------------- */

async function testBoot() {
  const c = await boot();
  eq("启动无运行时错误", c.errors.length, 0);
  check("周视图有内容", c.root().innerHTML.length > 5000, `只有 ${c.root().innerHTML.length} 字符`);
  check("提醒条存在", !!c.band());
  check("顶栏显示字母日或休", /今天是 [A-H] DAY|今天不上课/.test(c.text()));
}

async function testRotation() {
  const c = await boot();
  const data = await exportedData(c);
  const { map, total } = recomputeRotation(data.school);

  eq("学年上课日总数", total, 176);
  eq("上课日为 8 的整数倍（22 轮）", total % 8, 0);
  eq("8/24 是 A day", map.get("2026-08-24"), "A");
  eq("8/25 是 B day", map.get("2026-08-25"), "B");
  eq("最后一天 6/11 是 H day", map.get(data.school.yearEnd), "H");
  eq("秋假后 10/19 接上 C day", map.get("2026-10-19"), "C");
  await c.click("校历");
  check("设置里显示的统计一致", c.text().includes("176 天（22 轮 A–H 循环）"), c.text().slice(0, 120));

  // 每个班的轮换课表结构完整性
  data.classes.forEach((cl) => {
    const rotating = cl.blocks.filter((b) => typeof b.subject !== "string");
    check(`${cl.id} 有轮换时段`, rotating.length > 0);
    rotating.forEach((b) => {
      const keys = Object.keys(b.subject).sort().join("");
      check(`${cl.id} 的 ${b.label} 覆盖 A–H 八天`, keys === "ABCDEFGH", keys);
    });
  });

  // 各班 P2 的 special 排列应互不相同
  const p2 = data.classes.map((cl) => {
    const b = cl.blocks.find((x) => x.label === "P2");
    return b ? Object.values(b.subject).join(",") : "";
  });
  check("各班 P2 排列互不相同", new Set(p2).size === p2.length, p2.join(" | "));

  // 法定假日里落在上课日的那几天
  const onSchool = data.school.holidays.filter((h) => map.has(h.date));
  eq("上课日撞上法定假日的天数", onSchool.length, 5);
}

async function testViewSwitching() {
  const c = await boot();
  await c.click("月");
  check("月视图渲染", /(\d{4}) 年 (\d+) 月/.test(c.text()), c.text().slice(0, 60));
  check("月格有内容", c.monthCells().length > 15);
  await c.click("周");
  check("切回周视图", c.cards().length > 5);
  await c.click("月");
  await c.click("周");
  eq("反复切换无错误", c.errors.length, 0);
}

async function testMonthView() {
  const c = await boot({ url: "https://x.test/?class=RPJ&day=20261012" });
  await c.click("月");
  const heights = [...new Set(c.monthCells().map((x) => x.style.height))];
  eq("所有月格等高", heights.length, 1);
  check("今天有标记", c.monthCells().some((x) => x.textContent.includes("今天")), "没有格子标今天");
  check("假期显示原因", c.text().includes("秋假"));

  // 周末活动区
  const c2 = await boot({ url: "https://x.test/?class=RPJ&day=20270501" });
  await c2.click("月");
  check("五月有周末活动区", c2.text().includes("本月周末活动") && c2.text().includes("Carnival"));
  const c3 = await boot({ url: "https://x.test/?class=RPJ&day=20260901" });
  await c3.click("月");
  check("九月无周末活动则不显示该区", !c3.text().includes("本月周末活动"));
}

async function testPrepBand() {
  const cases = [
    ["20260831", /今天要带 · F day/, /明天要带 · G day/, "工作日"],
    ["20260830", /明天要带 · F day/, /9\/1（周二）要带 · G day/, "周日"],
    ["20260904", /今天要带 · B day/, /9\/7（周一）要带/, "周五，右栏跳到周一"],
    ["20261012", /10\/19（周一）要带/, null, "秋假中，跳过整个假期"],
    ["20270607", /明天要带 · E day/, null, "本年级不到校，跳到 6/8"],
  ];
  for (const [day, left, right, note] of cases) {
    const c = await boot({ url: `https://x.test/?class=RPJ&day=${day}` });
    const t = c.band() ? c.band().textContent.replace(/\s+/g, " ") : "";
    check(`提醒条 ${day}（${note}）左栏`, left.test(t), t.slice(0, 70));
    if (right) check(`提醒条 ${day} 右栏`, right.test(t), t.slice(0, 90));
  }

  const last = await boot({ url: "https://x.test/?class=RPJ&day=20270611" });
  eq("学年最后一天只有一栏", last.band().children.length, 1);

  const empty = await boot({ url: "https://x.test/?class=RPY&day=20260912" });
  check(
    "没有要带的东西时提醒条仍在",
    /H day/.test(empty.band().textContent) && empty.band().textContent.includes("没有要特别准备的东西")
  );
}

async function testContrast() {
  const seen = {};
  for (const url of [
    "https://x.test/?class=RPJ&day=20260831",
    "https://x.test/?class=RPJ&day=20260930",
    "https://x.test/?class=RPJ&day=20260902",
    "https://x.test/?class=RPY&day=20260831",
  ]) {
    const c = await boot({ url });
    const b = c.band();
    if (!b) continue;
    [...b.querySelectorAll("span")]
      .filter((x) => x.style.fontWeight === "700" && x.style.color)
      .forEach((sp) => {
        seen[sp.textContent] = ratio(rgbToHex(sp.style.color), NAVY);
      });
  }
  check("提醒条采样到科目名", Object.keys(seen).length >= 3, JSON.stringify(seen));
  for (const [name, r] of Object.entries(seen)) {
    check(`${name} 在深蓝底上达到 WCAG AA`, r >= 4.5, `对比度只有 ${r.toFixed(2)}`);
  }
}

async function testUrlParams() {
  const a = await boot({ url: "https://x.test/?class=RPY" });
  eq("?class=RPY 生效", a.doc.querySelector("select").value, "RPY");
  const b = await boot({ url: "https://x.test/?class=rpj" });
  eq("?class= 大小写不敏感", b.doc.querySelector("select").value, "RPJ");
  const c = await boot({ url: "https://x.test/?class=NOPE" });
  eq("班级名无效时回落", c.doc.querySelector("select").value, "RPJ");
  const d = await boot({ url: "https://x.test/?class=RPJ&day=20260922" });
  check("?day= 生效", /今天是 E DAY/.test(d.text()), d.text().slice(0, 60));
  check("?day= 显示预览提示条", d.text().includes("预览模式"));
  const e = await boot({ url: "https://x.test/?class=RPJ&day=garbage" });
  check("?day= 格式错误时忽略", !e.text().includes("预览模式"));
}

async function testBackToToday() {
  const c = await boot();
  const n0 = c.scrollTargets.length;
  await c.click("回到今天");
  const first = c.scrollTargets.length - n0;
  const n1 = c.scrollTargets.length;
  await c.click("回到今天");
  const second = c.scrollTargets.length - n1;
  check("第一次「回到今天」触发滚动", first > 0, `新增 ${first}`);
  check("第二次（focus 未变）仍触发滚动", second > 0, `新增 ${second} —— 这是曾经的 bug`);
}

async function testDesktop() {
  const c = await boot({ wide: true });
  check("桌面端有翻页箭头", c.buttons().filter((b) => ["‹", "›"].includes(b.textContent.trim())).length >= 2);
  eq("桌面端一屏五张卡", c.cards()[0].style.flex, "0 0 calc(20% - 6.4px)");
  check("桌面端不画周分隔线", c.cards().every((x) => x.style.paddingLeft !== "6px"));
  eq("桌面端容器加宽", c.root().firstElementChild.style.maxWidth, "1040px");

  await c.click("⚙");
  const overlay = [...c.doc.querySelectorAll("div")].find((x) => x.style.position === "fixed");
  eq("桌面端设置弹窗居中", overlay.style.alignItems, "center");
  eq("桌面端设置弹窗限宽", overlay.firstElementChild.style.maxWidth, "460px");
}

async function testDesktopPaging() {
  // 11/13 之后有 Fall Play 周末卡。jsdom 没有布局引擎，初始滚动位置不可靠，
  // 所以先翻到 11/9 那一周，再验证之后三页的相对顺序。
  const c = await boot({ url: "https://x.test/?class=RPJ&day=20261109", wide: true });
  // 卡片文本可能带「今天」「下次上学」前缀，比较前去掉
  const last = () =>
    (c.scrollTargets[c.scrollTargets.length - 1] || "").replace(/^(今天|下次上学)/, "");

  let guard = 0;
  while (guard++ < 10 && !/^11\/9周一/.test(last())) await c.click("›");
  check("能翻到 11/9 那一周", /^11\/9周一/.test(last()), last().slice(0, 20));

  const seq = [];
  for (let i = 0; i < 3; i++) {
    await c.click("›");
    seq.push(last().slice(0, 12));
  }
  check("下一页是周二起（周末卡那页）", /^11\/10周二/.test(seq[0]), seq[0]);
  check("再下一页回到周一对齐", /^11\/16周一/.test(seq[1]), seq[1]);
  check("继续保持周一对齐", /^11\/23周一/.test(seq[2]), seq[2]);

  await c.click("‹");
  check("往回翻对称", /^11\/16周一/.test(last()), last().slice(0, 12));
  eq("翻页全程无错误", c.errors.length, 0);
}

async function testMobile() {
  const c = await boot({ wide: false });
  check("手机端无翻页箭头", c.buttons().filter((b) => ["‹", "›"].includes(b.textContent.trim())).length === 0);
  eq("手机端一屏两张卡", c.cards()[0].style.flex, "0 0 calc(50% - 4px)");
  check("卡片用 border-box（周分隔线不撑破布局）", c.cards().every((x) => x.style.boxSizing === "border-box"));
  check("周一有分隔线", c.cards().some((x) => x.style.paddingLeft === "6px"));

  await c.click("⚙");
  const overlay = [...c.doc.querySelectorAll("div")].find((x) => x.style.position === "fixed");
  eq("手机端设置从底部升起", overlay.style.alignItems, "flex-end");
}

async function testWeekendCard() {
  const c = await boot({ url: "https://x.test/?class=RPJ&day=20261113" });
  const card = c.cards().find((x) => x.textContent.includes("周末活动"));
  check("有活动的周末插入周末卡", !!card);
  check("周末卡列出活动名", card && card.textContent.includes("Fall Play"));
  const dashed = card && card.querySelector("div").style.border;
  check("周末卡用虚线边框", !!dashed && dashed.includes("dashed"), dashed);

  const c2 = await boot({ url: "https://x.test/?class=RPJ&day=20260907" });
  check("无活动的周末不插卡", !c2.text().includes("周末活动"));
}

async function testSettings() {
  const c = await boot();
  await c.click("⚙");
  check("默认打开班级页", c.text().includes("课表时段"));
  eq("RPJ 有 8 个时段", c.doc.querySelectorAll('input[type="time"]').length / 2, 8);

  await c.click("科目");
  check("科目页列出全部科目", c.doc.querySelectorAll('input[type="color"]').length >= 11);

  await c.click("校历");
  check("校历页显示学年", c.text().includes("2026-08-24 → 2027-06-11"));

  await c.click("数据");
  const ta = () => c.doc.querySelector("textarea");
  eq("数据页默认只读", ta().readOnly, true);
  check("只读时为浅灰底", /231, 235, 241|#E7EBF1/i.test(ta().style.background), ta().style.background);
  await c.click("编辑 JSON");
  eq("点编辑后可写", ta().readOnly, false);
  await c.click("取消并还原");
  eq("取消后恢复只读", ta().readOnly, true);
  eq("全程无错误", c.errors.length, 0);
}

async function testPersistence() {
  const c = await boot({ url: "https://x.test/", store: {} });
  await pause(200);
  check("首次打开写入 storage", !!c.mem["smis:ui"], JSON.stringify(c.mem));
  const ui = JSON.parse(c.mem["smis:ui"] || "{}");
  check("记录了 seed 版本", typeof ui.seed === "number", JSON.stringify(ui));

  const old = await boot({ url: "https://x.test/", store: { "smis:ui": JSON.stringify({ activeId: "RPY", seed: 1 }) } });
  eq("沿用已存的班级", old.doc.querySelector("select").value, "RPY");
  const data = await exportedData(old);
  check("迁移补上了新班级", ["RPJ", "RPY", "RPH"].every((id) => data.classes.some((x) => x.id === id)),
    data.classes.map((x) => x.id).join(","));
  check("迁移补上了法定假日", (data.school.holidays || []).length >= 14);
  check("迁移更新了旧标签", !JSON.stringify(data.school).includes("Professional Development Day"));
}

/* ---------------- 执行 ---------------- */

const SUITES = [
  ["启动", testBoot],
  ["轮换算法", testRotation],
  ["视图切换", testViewSwitching],
  ["月视图", testMonthView],
  ["提醒条", testPrepBand],
  ["对比度", testContrast],
  ["URL 参数", testUrlParams],
  ["回到今天", testBackToToday],
  ["桌面布局", testDesktop],
  ["桌面翻页", testDesktopPaging],
  ["手机布局", testMobile],
  ["周末卡", testWeekendCard],
  ["设置页", testSettings],
  ["本地存储", testPersistence],
];

(async () => {
  const t0 = Date.now();
  for (const [name, fn] of SUITES) {
    const before = failures.length;
    try {
      await fn();
    } catch (e) {
      failures.push(`${name} 抛出异常 → ${e.message}`);
    }
    const bad = failures.length - before;
    console.log(`${bad ? "✗" : "✓"} ${name}${bad ? `  (${bad} 项失败)` : ""}`);
  }

  console.log("");
  if (failures.length) {
    console.log(`失败 ${failures.length} 项：`);
    failures.forEach((f) => console.log("   ✗ " + f));
  }
  console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(failures.length ? 1 : 0);
})();
