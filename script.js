// =========================================================
// サークル会計  script.js
// ① 帳簿(サークル費の入り・出と残高)
// ② 支出・精算(グラウンド代などの支出と、立替の返金)
// ③ イベント(参加者からの集金、払ったもの、締め)
// 名簿は①〜③で共通
// =========================================================


// ===== 1. 日付と学年 =====

function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return isoDate(date);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function splitDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return { year, month, day, weekday };
}

// "2026-10-19" → "10/19(月)"
function shortDate(iso) {
  const d = splitDate(iso);
  return `${d.month}/${d.day}(${d.weekday})`;
}

// 年度(4月始まり)
function schoolYearOf(iso) {
  const d = splitDate(iso);
  return d.month >= 4 ? d.year : d.year - 1;
}

const SY = schoolYearOf(isoDate(new Date()));

// 年度の最後の日("2027-03-31")
function yearEnd(year) {
  return `${year + 1}-03-31`;
}

function gradeOf(member) {
  const grade = SY - member.entryYear + 1;
  if (grade >= 5) return "OB";
  if (grade <= 0) return 1;
  return grade;
}

function gradeLabel(member) {
  const grade = gradeOf(member);
  return grade === "OB" ? "OB" : grade + "年";
}

function gradeSortKey(member) {
  const grade = gradeOf(member);
  return grade === "OB" ? 0 : grade;
}

function genderLabel(member) {
  if (member.gender === "男") return "男子";
  if (member.gender === "女") return "女子";
  return "性別未設定";
}


// ===== 2. 決まりごと =====

// 支出の種類
const CATEGORIES = [
  { key: "ground", label: "グラウンド代", short: "グラウンド", mark: "ground" },
  { key: "referee", label: "審判代", short: "審判", mark: "referee" },
  { key: "entry", label: "大会エントリー費", short: "大会", mark: "entry" },
  { key: "equipment", label: "ボール・備品", short: "備品", mark: "equipment" },
  { key: "other", label: "その他", short: "その他", mark: "other" }
];

// 一覧の左に出すアイコン(線で描く)
const ICONS = {
  ground: "M12 3l9 9-9 9-9-9z M12 9v.01",
  referee: "M5 21V4h11l-2 4 2 4H5",
  entry: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8",
  equipment: "M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M8.5 5c2 4 2 10 0 14 M15.5 5c-2 4-2 10 0 14",
  other: "M5 12h2 M11 12h2 M17 12h2",
  income: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  dues: "M9 8a3.5 3.5 0 1 0 0.01 0 M2.5 20a6.5 6.5 0 0 1 13 0 M17 9a2.5 2.5 0 1 0 0.01 0 M16 14.5a5 5 0 0 1 5.5 5",
  event: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 10h18 M8 3v4 M16 3v4"
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.other}"/></svg>`;
}

// 状態の札:色だけに頼らず、記号と文字でも分かるようにする
function chip(kind, text) {
  const marks = { unpaid: "!", done: "✓", refund: "↩", muted: "" };
  const mark = marks[kind] ? `<span aria-hidden="true">${marks[kind]}</span>` : "";
  return `<span class="status-chip is-${kind}">${mark}${text}</span>`;
}

// 空のときの表示(次にやることのボタンつき)
function emptyBox(text, action, label) {
  const button = action ? `<button class="btn-outline" data-action="${action}">${label}</button>` : "";
  return `<div class="empty"><p>${text}</p>${button}</div>`;
}

function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[4];
}

// イベントの種類
const EVENT_TYPES = ["飲み会", "合宿", "納会", "遠征", "その他"];

const MODE_LABELS = { grade: "学年別", equal: "均等", custom: "個別" };

// 学年ごとの金額("4F" などは女子)
const DEFAULT_PRICES = {
  "4": 0, "3": 0, "2": 0, "1": 0, "OB": 0,
  "4F": 0, "3F": 0, "2F": 0, "1F": 0, "OBF": 0
};

function modeLabel(c) {
  return c.mode === "grade" && c.byGender ? "学年×性別" : MODE_LABELS[c.mode];
}

const GROUPS = [
  { key: 4, title: "4年" },
  { key: 3, title: "3年" },
  { key: 2, title: "2年" },
  { key: 1, title: "1年" },
  { key: "OB", title: "OB・その他" }
];


// ===== 3. サンプルデータ =====

const sampleData = {
  settings: { startDate: daysAgo(80), startBalance: 120000, closedYears: {} },

  members: [
    { id: "m1", name: "田中", entryYear: SY - 3, role: "会計", gender: "男" },
    { id: "m2", name: "佐藤", entryYear: SY - 3, role: "幹部", gender: "男" },
    { id: "m3", name: "鈴木", entryYear: SY - 2, role: "幹部", gender: "女" },
    { id: "m4", name: "高橋", entryYear: SY - 2, role: "メンバー", gender: "男" },
    { id: "m5", name: "伊藤", entryYear: SY - 2, role: "メンバー", gender: "女" },
    { id: "m6", name: "渡辺", entryYear: SY - 1, role: "メンバー", gender: "男" },
    { id: "m7", name: "山本", entryYear: SY - 1, role: "メンバー", gender: "男" },
    { id: "m8", name: "中村", entryYear: SY - 1, role: "メンバー", gender: "女" },
    { id: "m9", name: "小林", entryYear: SY - 1, role: "メンバー", gender: "男" },
    { id: "m10", name: "加藤", entryYear: SY, role: "メンバー", gender: "男" },
    { id: "m11", name: "吉田", entryYear: SY, role: "メンバー", gender: "女" },
    { id: "m12", name: "山田", entryYear: SY, role: "メンバー", gender: "男" },
    { id: "m13", name: "井上", entryYear: SY - 5, role: "メンバー", gender: "男" }
  ],

  // 集金(kind:"部費" か "イベント")
  // entries: share = 負担額、done = 支払い済みか
  // payments(イベントのみ): 払ったもの。payerId が null なら会計が払った、あれば立替
  // closedDate(イベントのみ): 締めた日。締めると余り・不足が帳簿に入る
  collections: [
    {
      id: "c1", kind: "部費", title: `${SY}年度 部費`, date: daysAgo(40),
      mode: "grade", byGender: true, equalAmount: 0,
      gradePrices: { "4": 6000, "3": 8000, "2": 10000, "1": 10000, "OB": 0, "4F": 5000, "3F": 7000, "2F": 8000, "1F": 8000, "OBF": 0 },
      entries: [
        ["m1", 6000, true], ["m2", 6000, false], ["m3", 7000, true], ["m4", 8000, false],
        ["m5", 7000, true], ["m6", 10000, true], ["m7", 10000, false], ["m8", 8000, true],
        ["m9", 10000, true], ["m10", 10000, true], ["m11", 8000, true], ["m12", 10000, true]
      ].map(([id, share, done]) => ({ memberId: id, share, done })),
      payments: []
    },
    {
      id: "c2", kind: "イベント", eventType: "合宿", title: "夏合宿", date: daysAgo(60),
      mode: "equal", byGender: false, equalAmount: 15000, gradePrices: { ...DEFAULT_PRICES },
      entries: ["m1", "m2", "m3", "m4", "m6", "m8", "m10", "m11"].map((id) => ({ memberId: id, share: 15000, done: true })),
      payments: [
        { id: "p1", title: "宿代", amount: 100000, payerId: null, reimbursed: false },
        { id: "p2", title: "バス代", amount: 30000, payerId: "m1", reimbursed: true }
      ],
      closedDate: daysAgo(50)
    },
    {
      id: "c3", kind: "イベント", eventType: "飲み会", title: "9月 飲み会", date: daysAgo(25),
      mode: "grade", byGender: false, equalAmount: 0,
      gradePrices: { ...DEFAULT_PRICES, "4": 4500, "3": 3000, "2": 2000, "1": 1000 },
      entries: [
        ["m1", 4500, true], ["m2", 4500, true], ["m3", 3000, true], ["m4", 3000, false],
        ["m5", 3000, true], ["m6", 2000, false], ["m7", 2000, false], ["m8", 2000, true],
        ["m9", 2000, true], ["m10", 1000, true], ["m11", 1000, true], ["m12", 1000, true]
      ].map(([id, share, done]) => ({ memberId: id, share, done })),
      payments: [{ id: "p3", title: "お店の会計", amount: 29000, payerId: "m2", reimbursed: false }]
    },
    {
      id: "c4", kind: "イベント", eventType: "合宿", title: "冬合宿", date: daysAgo(-30),
      mode: "grade", byGender: true, equalAmount: 0,
      gradePrices: { ...DEFAULT_PRICES, "4": 16000, "3": 15000, "2": 15000, "1": 15000, "4F": 15000, "3F": 14000, "2F": 14000, "1F": 14000 },
      entries: [
        ["m1", 16000, true], ["m2", 16000, false], ["m3", 14000, true], ["m4", 15000, true],
        ["m6", 15000, false], ["m8", 14000, true], ["m10", 15000, false], ["m11", 14000, true]
      ].map(([id, share, done]) => ({ memberId: id, share, done })),
      payments: [{ id: "p4", title: "宿の予約金", amount: 30000, payerId: null, reimbursed: false }]
    }
  ],

  // サークル費からの支出
  expenses: [
    { id: "x1", date: daysAgo(72), category: "ground", amount: 4000, place: "〇〇球場 A面", time: "9:00〜12:00", payerId: null, reimbursed: false, memo: "" },
    { id: "x2", date: daysAgo(65), category: "ground", amount: 2000, place: "△△公園 A面", time: "9:00〜11:00", payerId: null, reimbursed: false, memo: "" },
    { id: "x3", date: daysAgo(44), category: "entry", amount: 10000, place: "秋季リーグ", time: "", payerId: null, reimbursed: false, memo: "" },
    { id: "x4", date: daysAgo(37), category: "ground", amount: 6000, place: "△△公園 B面", time: "13:00〜17:00", payerId: "m3", reimbursed: true, memo: "" },
    { id: "x5", date: daysAgo(30), category: "ground", amount: 4000, place: "〇〇球場 A面", time: "9:00〜12:00", payerId: null, reimbursed: false, memo: "" },
    { id: "x6", date: daysAgo(16), category: "equipment", amount: 5800, place: "練習球 1ダース", time: "", payerId: null, reimbursed: false, memo: "" },
    { id: "x7", date: daysAgo(9), category: "referee", amount: 6000, place: "秋季リーグ 審判代", time: "", payerId: "m2", reimbursed: false, memo: "" },
    { id: "x8", date: daysAgo(9), category: "ground", amount: 6000, place: "△△公園 B面", time: "13:00〜17:00", payerId: null, reimbursed: false, memo: "雨天中止は前日18時までに電話" },
    { id: "x9", date: daysAgo(2), category: "ground", amount: 4000, place: "〇〇球場 A面", time: "9:00〜12:00", payerId: null, reimbursed: false, memo: "予約番号 1234" }
  ],

  // 部費・イベント以外の収入
  incomes: [
    { id: "i1", date: daysAgo(20), title: "OB・OGからの支援", amount: 10000, memo: "" }
  ]
};

const emptyData = {
  settings: { startDate: isoDate(new Date()), startBalance: 0, closedYears: {} },
  members: [],
  collections: [],
  expenses: [],
  incomes: []
};


// ===== 4. 保存と読み込み =====
// ログインを足すときは loadData と saveData の中身だけを差し替える

const STORAGE_KEY = "shukin-data-v3";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

let data = loadData();

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    const v2 = localStorage.getItem("shukin-data-v2");
    if (v2) return migrateV2(JSON.parse(v2));
  } catch (error) {
    console.warn("保存データを読み込めませんでした", error);
  }
  return copy(sampleData);
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("保存できませんでした", error);
  }
}

// 前の版(飲み会・立替つきの集金)を、今の形に移す
function migrateV2(old) {
  const collections = (old.collections || []).map((c) => {
    const payments = [];
    for (const entry of c.entries) {
      if (entry.advance > 0) {
        payments.push({
          id: "p" + Math.random().toString(36).slice(2, 8),
          title: "立替",
          amount: entry.advance,
          payerId: entry.memberId,
          reimbursed: entry.done && entry.share - entry.advance < 0
        });
      }
    }
    return {
      ...c,
      kind: c.kind === "部費" ? "部費" : "イベント",
      eventType: c.kind === "部費" ? undefined : "飲み会",
      entries: c.entries.filter((e) => e.share > 0).map((e) => ({ memberId: e.memberId, share: e.share, done: e.done })),
      payments
    };
  });
  const expenses = (old.expenses || []).map((x) => ({
    ...x, category: x.category === "tournament" ? "entry" : x.category
  }));
  return {
    settings: { ...old.settings, closedYears: {} },
    members: old.members || [],
    collections,
    expenses,
    incomes: old.incomes || []
  };
}

const $ = (id) => document.getElementById(id);

function newId(prefix, index = 0) {
  return prefix + Date.now() + "-" + index;
}


// ===== 5. 計算 =====

function yen(amount) {
  if (amount < 0) return "−¥" + (-amount).toLocaleString("ja-JP");
  return "¥" + amount.toLocaleString("ja-JP");
}

function signedYen(amount) {
  return (amount >= 0 ? "+" : "") + yen(amount);
}

// 全角の数字も半角に直し、数字以外(カンマなど)は取りのぞいて金額にする
function toAmount(text) {
  const digits = String(text ?? "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[^0-9]/g, "");
  const number = Number(digits.slice(0, 9));
  return number > 0 ? number : 0;
}

// 入力欄に入れる形(1,000 のようにカンマつき。0 は空欄)
function amountText(amount) {
  return amount > 0 ? amount.toLocaleString("ja-JP") : "";
}

function findMember(memberId) {
  return data.members.find((m) => m.id === memberId)
    || { id: memberId, name: "(不明)", entryYear: SY, role: "メンバー", gender: "" };
}

function activeMembers() {
  return data.members
    .filter((m) => !m.left)
    .sort((a, b) => gradeSortKey(b) - gradeSortKey(a));
}

function collectionsOf(kind) {
  return data.collections.filter((c) => c.kind === kind);
}

// 集金の人数と金額
function summarize(c) {
  const s = { total: 0, people: c.entries.length, paid: 0, unpaid: 0, collected: 0, unpaidAmount: 0 };
  for (const entry of c.entries) {
    s.total += entry.share;
    if (entry.done) {
      s.paid += 1;
      s.collected += entry.share;
    } else {
      s.unpaid += 1;
      s.unpaidAmount += entry.share;
    }
  }
  const payments = c.payments || [];
  s.spent = payments.reduce((sum, p) => sum + p.amount, 0);
  s.refundLeft = payments.filter((p) => p.payerId && !p.reimbursed).reduce((sum, p) => sum + p.amount, 0);
  s.diffNow = s.collected - s.spent;       // 今の時点の差額
  s.diffFull = s.total - s.spent;          // 全員払ったときの差額
  return s;
}

function currentDues() {
  return collectionsOf("部費").filter((c) => schoolYearOf(c.date) === SY).pop() || null;
}

function afterStart(iso) {
  return iso >= data.settings.startDate;
}

// 帳簿の行(支出・その他の収入・部費・締めたイベントの余り/補填)
function ledgerItems() {
  const items = [];
  for (const x of data.expenses) {
    if (!afterStart(x.date)) continue;
    const cat = categoryOf(x.category);
    const pending = !!x.payerId && !x.reimbursed;
    let payer = "サークル費から";
    if (x.payerId) payer = `${findMember(x.payerId).name}さん立替` + (x.reimbursed ? "(返金済み)" : "");
    items.push({
      type: "expense", id: x.id, date: x.date, amount: -x.amount, category: x.category,
      title: x.place || cat.label, mark: cat.mark, isIn: false, pending, payerId: x.payerId,
      memo: x.memo || "", sub: `${shortDate(x.date)} ・ ${payer}`, payerText: payer
    });
  }
  for (const i of data.incomes) {
    if (!afterStart(i.date)) continue;
    items.push({
      type: "income", id: i.id, date: i.date, amount: i.amount,
      title: i.title, mark: "income", isIn: true, pending: false, memo: i.memo || "",
      sub: shortDate(i.date) + (i.memo ? " ・ " + i.memo : "")
    });
  }
  for (const c of collectionsOf("部費")) {
    const s = summarize(c);
    items.push({
      type: "collection", id: c.id, date: c.date, amount: s.collected,
      title: c.title, mark: "dues", isIn: true, pending: false, memo: "",
      sub: `${s.paid}人分 回収済み` + (s.unpaid > 0 ? ` ・ 残り${s.unpaid}人` : "")
    });
  }
  for (const c of collectionsOf("イベント")) {
    if (!c.closedDate) continue;
    const diff = summarize(c).diffNow;
    if (diff === 0) continue;
    items.push({
      type: "collection", id: c.id, date: c.closedDate, amount: diff,
      title: `${c.title} ${diff > 0 ? "余り" : "補填"}`, mark: "event", isIn: diff > 0,
      pending: false, memo: "", sub: `${shortDate(c.closedDate)} ・ イベントを締めて記録`
    });
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ある日までの残高
function balanceUntil(iso) {
  return data.settings.startBalance + ledgerItems()
    .filter((item) => item.date <= iso)
    .reduce((sum, item) => sum + item.amount, 0);
}

// 立替の返金待ち(支出とイベントの両方)
function pendingReimbursements() {
  const list = [];
  for (const x of data.expenses) {
    if (x.payerId && !x.reimbursed) {
      list.push({ kind: "expense", id: x.id, payerId: x.payerId, amount: x.amount, date: x.date, title: x.place || categoryOf(x.category).label });
    }
  }
  for (const c of collectionsOf("イベント")) {
    for (const p of c.payments || []) {
      if (p.payerId && !p.reimbursed) {
        list.push({ kind: "payment", id: p.id, collectionId: c.id, payerId: p.payerId, amount: p.amount, date: c.date, title: `${c.title} ${p.title}` });
      }
    }
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// 1人の部費・イベントの未払い・返金待ち
function memberStatus(memberId) {
  const dues = currentDues();
  let duesState = "none";
  let duesAmount = 0;
  if (dues) {
    const entry = dues.entries.find((e) => e.memberId === memberId);
    if (entry) {
      duesState = entry.done ? "done" : "unpaid";
      duesAmount = entry.share;
    }
  }
  let eventOwe = 0;
  for (const c of collectionsOf("イベント")) {
    for (const entry of c.entries) {
      if (entry.memberId === memberId && !entry.done) eventOwe += entry.share;
    }
  }
  const receive = pendingReimbursements()
    .filter((r) => r.payerId === memberId)
    .reduce((sum, r) => sum + r.amount, 0);
  return { duesState, duesAmount, eventOwe, receive };
}


// ===== 6. 画面の切り替えと共通の部品 =====

const TABS = ["home", "spend", "events", "members"];
let currentTab = "home";
let selectedYear = SY;                // 表示する年度
let openMonths = {};                  // 開いている月 { "home:2026-10": true }
let spendCategory = "all";            // 支出の種類の絞り込み
let spendPayer = "all";               // 支出の払った人の絞り込み
let spendSearch = "";                 // 支出の検索語
let membersFilter = "all";
let showOB = false;
let currentCollectionId = null;
let currentMemberId = null;

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  const isTab = TABS.includes(name);
  document.getElementById("tabbar").hidden = !isTab;
  if (isTab) currentTab = name;
  document.querySelectorAll(".tab").forEach((tab) => {
    const isCurrent = tab.dataset.tab === currentTab;
    tab.classList.toggle("active", isCurrent);
    if (isCurrent) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

function goTo(name) {
  if (name === "tab") name = currentTab;
  const renderers = {
    home: renderHome,
    spend: renderSpend,
    events: renderEvents,
    members: renderMembers,
    detail: renderDetail
  };
  renderYearSelects();
  if (renderers[name]) renderers[name]();
  showScreen(name);
}

function rerender() {
  goTo(document.querySelector(".screen.active").id.replace("screen-", ""));
}

// お知らせ。onUndo を渡すと「元に戻す」ボタンが5秒間出る
let toastUndo = null;

function showToast(message, onUndo) {
  const toast = $("toast");
  $("toast-text").textContent = message;
  toastUndo = onUndo || null;
  $("toast-undo").hidden = !onUndo;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(hideToast, onUndo ? 5000 : 2500);
}

function hideToast() {
  $("toast").classList.remove("show");
  toastUndo = null;
}

// データを変える操作をまとめて行い、元に戻せるようにする
// (確認の画面を出す代わりに、あとから取り消せる形にする)
function commit(message, change, after = rerender) {
  const before = copy(data);
  change();
  saveData();
  after();
  showToast(message, () => {
    data = before;
    saveData();
    rerender();
    showToast("元に戻しました");
  });
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

// 年度の選択肢(記録のある年度〜今年度)
function renderYearSelects() {
  const years = new Set([SY, schoolYearOf(data.settings.startDate)]);
  for (const item of ledgerItems()) years.add(schoolYearOf(item.date));
  for (const c of data.collections) years.add(schoolYearOf(c.date));
  const sorted = [...years].filter((y) => y <= SY).sort((a, b) => b - a);
  const options = sorted.map((y) =>
    `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}年度${data.settings.closedYears[y] ? "(締め済み)" : ""}</option>`).join("");
  document.querySelectorAll("[data-year-select]").forEach((select) => {
    select.innerHTML = options;
  });
}

// 締めた年度の記録は変えられないようにする
function isLocked(iso) {
  return !!data.settings.closedYears[schoolYearOf(iso)];
}

// 帳簿の1行
// 支出は黒字に「−」、入りは紺で「+」。赤は行動が必要なもの(未払い・不足)だけに使う
function ledgerLine(item) {
  const amountClass = item.isIn ? "is-in-amount" : item.amount < 0 && item.type === "collection" ? "is-danger" : "";
  return `
    <button class="line" data-ledger-type="${item.type}" data-ledger-id="${item.id}">
      <span class="mark${item.isIn ? " is-in" : ""}">${icon(item.mark)}</span>
      <span class="line-main">
        <span class="line-title">${item.title}</span>
        <span class="line-sub">${item.sub}</span>
        ${item.pending ? `<span class="line-chips">${chip("refund", "立替 未返金")}</span>` : ""}
      </span>
      <span class="line-amount num ${amountClass}">${signedYen(item.amount)}</span>
    </button>`;
}

// 月ごとにまとめて、開く・閉じるができる形にする(scope は画面の名前)
function monthBlocks(items, scope) {
  const months = [];
  for (const item of items) {
    const key = item.date.slice(0, 7);
    let m = months.find((x) => x.key === key);
    if (!m) {
      m = { key, items: [], plus: 0, minus: 0 };
      months.push(m);
    }
    m.items.push(item);
    if (item.amount >= 0) m.plus += item.amount;
    else m.minus += item.amount;
  }
  return months.map((m, index) => {
    const id = `${scope}:${m.key}`;
    // 何も選ばれていなければ、一番新しい月だけ開いておく
    const isOpen = openMonths[id] !== undefined ? openMonths[id] : index === 0;
    const [year, month] = m.key.split("-").map(Number);
    // 帳簿では「入り/出」と月末の残高、支出では「出」の合計を見出しに出す
    const sums = scope === "home"
      ? `<span>入り <span class="num is-in-amount">${signedYen(m.plus)}</span> ・ 出 <span class="num">${signedYen(m.minus)}</span></span>
         <span class="sub">月末残高 <span class="num">${yen(balanceUntil(m.key + "-31"))}</span></span>`
      : `<span>出 <span class="num">${signedYen(m.minus)}</span></span>`;
    return `
      <div class="month${isOpen ? " is-open" : ""}">
        <button class="month-toggle" data-month="${id}" aria-expanded="${isOpen}">
          <span class="month-name">${month}月<span class="sub">${year}年 ・ ${m.items.length}件</span></span>
          <span class="month-sums">${sums}</span>
          <span class="month-arrow" aria-hidden="true">›</span>
        </button>
        ${isOpen ? `<div class="sheet-list">${m.items.map(ledgerLine).join("")}</div>
          <div class="month-tools"><button class="btn-link" data-copy-month="${scope}:${m.key}">この月をコピー</button></div>` : ""}
      </div>`;
  }).join("");
}


// ===== 7. ① 帳簿(ホーム) =====

function renderHome() {
  const items = ledgerItems().filter((item) => schoolYearOf(item.date) === selectedYear);
  const isNow = selectedYear === SY;
  const balance = isNow ? balanceUntil("9999-12-31") : balanceUntil(yearEnd(selectedYear));
  const plus = items.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
  const minus = items.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0);

  document.getElementById("home-balance-label").textContent = isNow ? "サークル費の残高" : `${selectedYear}年度末の残高`;
  document.getElementById("home-balance").textContent = yen(balance);
  document.getElementById("home-in").textContent = signedYen(plus);
  document.getElementById("home-out").textContent = signedYen(minus);
  document.getElementById("home-count").textContent = `${selectedYear}年度 ${items.length}件`;

  // 今年度の部費
  let dues = "";
  if (isNow) {
    const c = currentDues();
    if (c) {
      const s = summarize(c);
      const percent = s.people === 0 ? 100 : Math.round((s.paid / s.people) * 100);
      dues = `
        <button class="info-card" data-collection-id="${c.id}">
          <span class="info-card-top">
            <span>${c.title}</span>
            ${s.unpaid > 0 ? chip("unpaid", `未払い ${s.unpaid}人`) : chip("done", "全員 支払い済み")}
          </span>
          <span class="bar" aria-hidden="true"><span class="bar-fill" style="width: ${percent}%"></span></span>
          <span class="progress-text">${s.paid} / ${s.people}人 支払い済み${s.unpaid > 0 ? ` ・ 残り <span class="num is-danger">${yen(s.unpaidAmount)}</span>` : ""}</span>
        </button>`;
    } else {
      dues = `<button class="info-card is-dashed" id="btn-dues-new"><span class="info-card-top"><span>${SY}年度の部費の集金を作る</span><span>＋</span></span></button>`;
    }
  }
  document.getElementById("home-dues").innerHTML = dues;

  // 立替の返金待ちのお知らせ
  const pending = pendingReimbursements();
  const pendingTotal = pending.reduce((s, r) => s + r.amount, 0);
  document.getElementById("home-alerts").innerHTML = isNow && pending.length > 0
    ? `<button class="info-card is-blue" data-goto="spend">
        <span class="info-card-top"><span>↩ 立替の返金待ち ${pending.length}件</span><span class="num is-info">${yen(pendingTotal)}</span></span>
        <span class="sub">返金したら、支出・精算のタブで「返金した」を押します</span>
      </button>`
    : "";

  // 過去の年度を締める
  let close = "";
  if (selectedYear < SY && !data.settings.closedYears[selectedYear]) {
    close = `<button class="info-card is-dashed" id="btn-year-close">
      <span class="info-card-top"><span>${selectedYear}年度を締める</span><span>›</span></span>
      <span class="sub">年度末の残高を確定し、この年度の記録を変更できないようにします</span>
    </button>`;
  } else if (data.settings.closedYears[selectedYear]) {
    close = `<p class="hint">${selectedYear}年度は締め済みです(年度末残高 ${yen(data.settings.closedYears[selectedYear].balance)})</p>`;
  }
  document.getElementById("home-year-close").innerHTML = close;

  document.getElementById("home-months").innerHTML = monthBlocks(items, "home")
    || emptyBox(`${selectedYear}年度の記録はまだありません`, isLocked(isoDate(new Date())) ? "" : "add-record", "最初の記録をつける");
}

function closeYear() {
  const balance = balanceUntil(yearEnd(selectedYear));
  if (!confirm(`${selectedYear}年度を締めますか?\n\n年度末の残高 ${yen(balance)} で確定します。\nこの年度の記録は、締めたあと変更できません。`)) return;
  data.settings.closedYears[selectedYear] = { balance, date: isoDate(new Date()) };
  saveData();
  goTo("home");
  showToast(`${selectedYear}年度を締めました`);
}


// ===== 8. ② 支出・精算 =====

function spendItems() {
  return ledgerItems().filter((item) => {
    if (item.type !== "expense") return false;
    if (schoolYearOf(item.date) !== selectedYear) return false;
    if (spendCategory !== "all" && item.category !== spendCategory) return false;
    if (spendPayer === "club" && item.payerId) return false;
    if (spendPayer !== "all" && spendPayer !== "club" && item.payerId !== spendPayer) return false;
    if (spendSearch && !(item.title + " " + item.memo).includes(spendSearch)) return false;
    return true;
  });
}

function renderSpend() {
  // 種類別の合計(年度内)
  const yearExpenses = data.expenses.filter((x) => afterStart(x.date) && schoolYearOf(x.date) === selectedYear);
  const total = yearExpenses.reduce((s, x) => s + x.amount, 0);
  const cats = [{ key: "all", short: "すべて" }, ...CATEGORIES].map((c) => {
    const sum = c.key === "all" ? total : yearExpenses.filter((x) => x.category === c.key).reduce((s, x) => s + x.amount, 0);
    return `
      <button class="cat${spendCategory === c.key ? " active" : ""}" data-cat="${c.key}">
        <span class="cat-label">${c.short}</span>
        <span class="cat-value num">${yen(sum)}</span>
      </button>`;
  }).join("");
  document.getElementById("spend-cats").innerHTML = cats;

  // 立替の返金待ち
  const pending = pendingReimbursements();
  document.getElementById("spend-pending").innerHTML = pending.length === 0 ? "" :
    `<p class="section-title refund">↩ 立替の返金待ち ${pending.length}件</p>` + pending.map((r) => `
      <div class="pending">
        <div class="pending-text">
          <p class="pending-title num">${findMember(r.payerId).name}さんへ ${yen(r.amount)}</p>
          <p class="pending-sub">${shortDate(r.date)} ${r.title}${r.kind === "payment" ? "(イベント)" : ""}</p>
        </div>
        <button class="btn-small" data-reimburse="${r.kind}:${r.id}:${r.collectionId || ""}">返金した</button>
      </div>`).join("");

  // 払った人の選択肢
  const payers = [...new Set(data.expenses.filter((x) => x.payerId).map((x) => x.payerId))];
  document.getElementById("spend-payer").innerHTML =
    `<option value="all">払った人:全員</option><option value="club">サークル費から</option>` +
    payers.map((id) => `<option value="${id}">${findMember(id).name}さん立替</option>`).join("");
  document.getElementById("spend-payer").value = spendPayer;
  document.getElementById("spend-search").value = spendSearch;

  const items = spendItems();
  const filtered = spendCategory !== "all" || spendPayer !== "all" || spendSearch;
  document.getElementById("spend-filter-note").innerHTML = filtered
    ? `${items.length}件 ・ 合計 <span class="num">${yen(-items.reduce((s, i) => s + i.amount, 0))}</span> <button class="btn-link" id="btn-filter-clear">絞り込みを解除</button>`
    : "";

  // 絞り込み中は全部の月を開いて見せる
  const html = filtered
    ? `<div class="sheet-list">${items.map(ledgerLine).join("")}</div>`
    : monthBlocks(items, "spend");
  document.getElementById("spend-months").innerHTML = items.length > 0 ? html
    : filtered
      ? emptyBox("条件に合う支出はありません", "clear-filter", "絞り込みを解除")
      : emptyBox(`${selectedYear}年度の支出はまだありません`, "add-expense", "最初の支出を記録");
}

function reimburse(code) {
  const [kind, id, collectionId] = code.split(":");
  let record;
  if (kind === "expense") {
    record = data.expenses.find((x) => x.id === id);
  } else {
    const c = data.collections.find((x) => x.id === collectionId);
    record = c.payments.find((p) => p.id === id);
  }
  commit(`${findMember(record.payerId).name}さんへの返金 ${yen(record.amount)} を記録しました`, () => {
    record.reimbursed = true;
  });
}

function copyMonth(code) {
  const [scope, key] = code.split(":");
  const base = scope === "spend" ? spendItems() : ledgerItems();
  const items = base.filter((i) => i.date.startsWith(key)).reverse();
  const [year, month] = key.split("-").map(Number);
  let plus = 0;
  let minus = 0;
  const lines = items.map((i) => {
    if (i.amount >= 0) plus += i.amount;
    else minus += i.amount;
    return `${shortDate(i.date)} ${i.title} ${signedYen(i.amount)}`;
  });
  const text = [`【${scope === "spend" ? "支出" : "サークル費"} ${year}年${month}月】`, ...lines, `入り ${signedYen(plus)} / 出 ${signedYen(minus)}`].join("\n");
  copyText(text).then(() => showToast(`${month}月分をコピーしました`));
}


// ===== 9. ③ イベント =====

function renderEvents() {
  const events = collectionsOf("イベント");
  let unpaid = 0;
  let refund = 0;
  for (const c of events) {
    const s = summarize(c);
    unpaid += s.unpaidAmount;
    refund += s.refundLeft;
  }
  document.getElementById("events-unpaid").textContent = yen(unpaid);
  document.getElementById("events-refund").textContent = yen(refund);

  // 集金中(締めていないもの)は年度に関係なく出す
  const active = events.filter((c) => !c.closedDate).sort((a, b) => (a.date < b.date ? 1 : -1));
  document.getElementById("events-active").innerHTML = active.map((c) => {
    const s = summarize(c);
    const percent = s.people === 0 ? 100 : Math.round((s.paid / s.people) * 100);
    const status = s.unpaid > 0
      ? chip("unpaid", `未払い ${s.unpaid}人`)
      : chip("done", `締められます(${s.diffNow >= 0 ? "余り" : "不足"} ${yen(Math.abs(s.diffNow))})`);
    return `
      <button class="card" data-collection-id="${c.id}">
        <span class="card-top">
          <span><span class="sub">${c.eventType} ・ ${shortDate(c.date)}</span><span class="card-title">${c.title}</span></span>
          <span class="card-total num">${yen(s.total)}</span>
        </span>
        <span class="bar" aria-hidden="true"><span class="bar-fill" style="width: ${percent}%"></span></span>
        <span class="card-bottom">
          <span>${modeLabel(c)} ・ ${s.paid} / ${s.people}人</span>
          ${status}
        </span>
      </button>`;
  }).join("") || emptyBox("集金中のイベントはありません", "add-event", "イベントを作る");

  // 締めたイベントは、選んでいる年度のものだけ
  const closed = events.filter((c) => c.closedDate && schoolYearOf(c.closedDate) === selectedYear)
    .sort((a, b) => (a.closedDate < b.closedDate ? 1 : -1));
  document.getElementById("events-closed").innerHTML = closed.length === 0
    ? emptyBox(`${selectedYear}年度に締めたイベントはありません`)
    : `<div class="sheet-list">${closed.map((c) => {
      const diff = summarize(c).diffNow;
      const text = diff > 0 ? `余り ${signedYen(diff)}` : diff < 0 ? `補填 ${yen(diff)}` : "過不足なし";
      return `
          <button class="closed-row" data-collection-id="${c.id}">
            <span><span class="line-title">${c.title}</span><span class="line-sub">${c.eventType} ・ ${shortDate(c.closedDate)} に締め</span></span>
            <span class="num ${diff > 0 ? "is-in-amount" : diff < 0 ? "is-danger" : ""}">${text}</span>
          </button>`;
    }).join("")}</div>`;
}


// ===== 10. 名簿 =====

function renderMembers() {
  const members = activeMembers();
  const dues = currentDues();
  document.getElementById("members-count").textContent = `${members.filter((m) => gradeOf(m) !== "OB").length}人(OB除く) ・ ${SY}年度`;
  document.querySelectorAll("#members-filter .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.membersFilter === membersFilter);
  });
  document.getElementById("members-show-ob").checked = showOB;

  let html = "";
  for (const group of GROUPS) {
    if (group.key === "OB" && !showOB) continue;
    let inGroup = members.filter((m) => gradeOf(m) === group.key);
    if (membersFilter === "unpaid") inGroup = inGroup.filter((m) => memberStatus(m.id).duesState === "unpaid");
    if (inGroup.length === 0) continue;

    const rows = inGroup.map((m) => {
      const st = memberStatus(m.id);
      let role = "";
      if (m.role === "会計") role = `<span class="role is-lead">会計</span>`;
      if (m.role === "幹部") role = `<span class="role">幹部</span>`;
      const states = [];
      if (dues) {
        if (st.duesState === "done") states.push(chip("done", "部費 済み"));
        if (st.duesState === "unpaid") states.push(chip("unpaid", `部費 ${yen(st.duesAmount)}`));
        if (st.duesState === "none") states.push(chip("muted", "部費 対象外"));
      }
      if (st.eventOwe > 0) states.push(chip("unpaid", `イベント ${yen(st.eventOwe)}`));
      if (st.receive > 0) states.push(chip("refund", `返金待ち ${yen(st.receive)}`));
      return `
        <button class="line" data-member-id="${m.id}">
          <span class="line-main">
            <span class="line-title">${m.name}${role}</span>
            <span class="line-sub${m.gender ? "" : " is-danger"}">${m.gender ? genderLabel(m) : "性別が未設定です"}</span>
          </span>
          <span class="member-states">${states.join("")}</span>
        </button>`;
    }).join("");

    const yearText = group.key === "OB" ? "" : `${SY - group.key + 1}年度入学`;
    html += `
      <div class="group">
        <p class="group-head"><span>${group.title}(${inGroup.length}人)</span><span>${yearText}</span></p>
        <div class="sheet-list">${rows}</div>
      </div>`;
  }
  document.getElementById("members-groups").innerHTML = html || (membersFilter === "unpaid"
    ? emptyBox("部費が未払いの人はいません")
    : emptyBox("名簿にまだ誰もいません", "add-members", "メンバーを追加"));
}

function yearOptions(selected) {
  let options = "";
  for (let i = 0; i <= 6; i += 1) {
    const year = SY - i;
    const label = i < 4 ? `${year}年度入学(今の${i + 1}年)` : `${year}年度入学(OB)`;
    options += `<option value="${year}" ${year === selected ? "selected" : ""}>${label}</option>`;
  }
  if (selected < SY - 6) options += `<option value="${selected}" selected>${selected}年度入学(OB)</option>`;
  return options;
}

function openBulk() {
  document.getElementById("bulk-year").innerHTML = yearOptions(SY);
  document.getElementById("bulk-names").value = "";
  document.getElementById("bulk-gender").value = "";
  showScreen("bulk");
}

function addMembersInBulk() {
  const year = Number(document.getElementById("bulk-year").value);
  const gender = document.getElementById("bulk-gender").value;
  const names = document.getElementById("bulk-names").value
    .split(/[\n,、]/).map((n) => n.trim()).filter((n) => n !== "");
  if (names.length === 0) {
    alert("名前を1人以上入れてください");
    return;
  }
  names.forEach((name, i) => data.members.push({ id: newId("m", i), name, entryYear: year, role: "メンバー", gender }));
  saveData();
  goTo("members");
  showToast(`${names.length}人を追加しました`);
}

function openMember(id) {
  currentMemberId = id;
  const m = findMember(id);
  document.getElementById("member-name").value = m.name;
  document.getElementById("member-year").innerHTML = yearOptions(m.entryYear);
  document.getElementById("member-gender").value = m.gender || "";
  document.getElementById("member-role").value = m.role || "メンバー";
  showScreen("member");
}

function saveMember() {
  const m = findMember(currentMemberId);
  const name = document.getElementById("member-name").value.trim();
  if (name === "") {
    alert("名前を入れてください");
    return;
  }
  m.name = name;
  m.entryYear = Number(document.getElementById("member-year").value);
  m.gender = document.getElementById("member-gender").value;
  m.role = document.getElementById("member-role").value;
  saveData();
  goTo("members");
  showToast("保存しました");
}

function removeMember() {
  const m = findMember(currentMemberId);
  commit(`${m.name}さんを名簿から外しました`, () => {
    m.left = true;
  }, () => goTo("members"));
}


// ===== 11. 集金の詳細(部費・イベント) =====

function renderDetail() {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  const s = summarize(c);
  const isEvent = c.kind === "イベント";

  document.getElementById("detail-title").innerHTML = c.title + (c.closedDate ? `<span class="closed-badge">締め済み</span>` : "");
  document.getElementById("detail-meta").textContent = [isEvent ? c.eventType : "部費", shortDate(c.date), modeLabel(c)].join(" ・ ");

  // まとめ
  let rows = `
    <div class="money-row"><span>集めた額(${s.people}人中${s.paid}人)</span><span class="num is-in-amount">${signedYen(s.collected)}</span></div>
    <div class="money-row"><span>まだ集める(${s.unpaid}人)</span><span class="num${s.unpaidAmount > 0 ? " is-danger" : ""}">${yen(s.unpaidAmount)}</span></div>`;
  if (isEvent) {
    rows += `<div class="money-row"><span>払った額</span><span class="num">${signedYen(-s.spent)}</span></div>`;
    const diff = s.unpaid > 0 ? s.diffFull : s.diffNow;
    const label = s.unpaid > 0 ? "全員払ったときの差額" : "差額";
    const word = diff > 0 ? "余り" : diff < 0 ? "不足" : "過不足なし";
    rows += `<div class="money-row is-total"><span>${label}</span><span class="num ${diff > 0 ? "is-in-amount" : diff < 0 ? "is-danger" : ""}">${word}${diff !== 0 ? " " + signedYen(diff) : ""}</span></div>`;
    rows += `<p class="money-note">${c.closedDate
      ? `${shortDate(c.closedDate)} に締め、帳簿に記録しました。直すと帳簿の金額も自動で合います。`
      : "締めると、余りはサークル費の入り、不足はサークル費からの補填として帳簿に記録します。"}</p>`;
  } else {
    rows += `<p class="money-note">回収した分は、そのままサークル費の入りとして帳簿に載ります。</p>`;
  }
  document.getElementById("detail-summary").innerHTML = `<div class="money">${rows}</div>`;

  // 払ったもの(イベントのみ)
  document.getElementById("detail-payments-box").hidden = !isEvent;
  if (isEvent) {
    const payments = c.payments || [];
    document.getElementById("detail-payments").innerHTML = payments.length === 0
      ? emptyBox("宿代やお店の会計など、払ったものを記録します", "add-payment", "払ったものを追加")
      : payments.map((p) => {
        const who = p.payerId
          ? `<span class="line-sub">${findMember(p.payerId).name}さん立替${p.reimbursed ? "(返金済み)" : ""}</span>`
            + (p.reimbursed ? "" : `<span class="line-chips">${chip("refund", "立替 未返金")}</span>`)
          : `<span class="line-sub">会計が支払い</span>`;
        return `
          <button class="line" data-payment-id="${p.id}">
            <span class="line-main"><span class="line-title">${p.title}</span>${who}</span>
            <span class="line-amount num">${signedYen(-p.amount)}</span>
          </button>`;
      }).join("");
  }

  // 参加者
  const entries = [...c.entries].sort((a, b) => gradeSortKey(findMember(b.memberId)) - gradeSortKey(findMember(a.memberId)));
  document.getElementById("detail-members").innerHTML = entries.map((e) => {
    const m = findMember(e.memberId);
    return `
      <button class="line${e.done ? " is-done" : ""}" data-entry-member="${e.memberId}" aria-pressed="${e.done}">
        <span class="check" aria-hidden="true">${e.done ? "✓" : ""}</span>
        <span class="line-main">
          <span class="line-title">${m.name}</span>
          <span class="line-sub">${gradeLabel(m)}</span>
        </span>
        <span class="line-amount num">${yen(e.share)}</span>
        ${e.done ? chip("done", "済み") : chip("unpaid", "未払い")}
      </button>`;
  }).join("") || emptyBox("参加者がいません。右上の「編集」から選びます");

  // 下のボタン
  const closeButton = document.getElementById("btn-close-event");
  closeButton.hidden = !isEvent;
  closeButton.textContent = c.closedDate ? "締めを取り消す" : "締める";
  document.getElementById("btn-copy-unpaid").disabled = s.unpaid === 0;
  document.getElementById("btn-copy-unpaid").textContent = s.unpaid === 0 ? "全員支払い済み" : "未払いの人へ連絡";
}

function openCollection(id) {
  currentCollectionId = id;
  goTo("detail");
}

// 未払いの人への連絡文
function copyUnpaid() {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  const unpaid = c.entries.filter((e) => !e.done);
  const lines = unpaid.map((e) => `・${findMember(e.memberId).name}さん ${yen(e.share)}`);
  const text = [
    `【${c.title}】の集金のお願いです。`,
    "まだの人は会計までお願いします。",
    "",
    ...lines,
    "",
    "行き違いで払っていたらごめんなさい!"
  ].join("\n");
  copyText(text).then(() => showToast("連絡文をコピーしました。LINEに貼り付けて送れます"));
}

function toggleClose() {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  if (c.closedDate) {
    if (!confirm("締めを取り消しますか?帳簿に記録した余り・補填も消えます。")) return;
    delete c.closedDate;
    saveData();
    renderDetail();
    showToast("締めを取り消しました");
    return;
  }
  const s = summarize(c);
  const diff = s.diffNow;
  const word = diff > 0 ? `余り ${yen(diff)} をサークル費の入りとして` : diff < 0 ? `不足 ${yen(-diff)} をサークル費からの補填として` : "過不足なしとして";
  const warn = s.unpaid > 0 ? `\n\n※まだ未払いの人が${s.unpaid}人(${yen(s.unpaidAmount)})います。今の集めた額で計算します。` : "";
  if (!confirm(`「${c.title}」を締めますか?\n\n${word}帳簿に記録します。${warn}`)) return;
  c.closedDate = isoDate(new Date());
  saveData();
  renderDetail();
  showToast("締めて帳簿に記録しました");
}


// ===== 12. 集金を作る・編集する(3段階) =====

let form = null;

function openForm(kind, id) {
  const c = data.collections.find((x) => x.id === id);
  const last = [...collectionsOf(kind)].reverse().find((x) => x.mode === "grade");
  form = c ? {
    step: 1, editingId: c.id, kind: c.kind, eventType: c.eventType || "飲み会",
    title: c.title, date: c.date, mode: c.mode, byGender: !!c.byGender,
    gradePrices: { ...DEFAULT_PRICES, ...(c.gradePrices || {}) }, equalAmount: c.equalAmount || 0,
    custom: Object.fromEntries(c.entries.map((e) => [e.memberId, e.share])),
    selected: c.entries.map((e) => e.memberId)
  } : {
    step: 1, editingId: null, kind, eventType: "飲み会",
    title: kind === "部費" ? `${SY}年度 部費` : "", date: isoDate(new Date()),
    mode: last ? "grade" : (kind === "部費" ? "equal" : "grade"), byGender: last ? !!last.byGender : false,
    gradePrices: { ...DEFAULT_PRICES, ...(last ? last.gradePrices : {}) }, equalAmount: 0,
    custom: {}, selected: activeMembers().filter((m) => gradeOf(m) !== "OB").map((m) => m.id)
  };

  document.getElementById("form-kind").textContent = (form.editingId ? "編集中:" : "新しく作る:") + form.kind;
  document.getElementById("form-event-box").hidden = form.kind !== "イベント";
  document.getElementById("form-title").value = form.title;
  document.getElementById("form-date").value = form.date;
  document.getElementById("form-equal").value = amountText(form.equalAmount);
  document.querySelectorAll("[data-grade-key]").forEach((input) => {
    input.value = amountText(form.gradePrices[input.dataset.gradeKey]);
  });
  document.getElementById("form-by-gender").checked = form.byGender;
  renderFormTypes();
  renderFormMode();
  renderFormStep();
  showScreen("form");
}

function renderFormTypes() {
  document.getElementById("form-types").innerHTML = EVENT_TYPES.map((t) =>
    `<button class="chip${t === form.eventType ? " active" : ""}" data-event-type="${t}">${t}</button>`).join("");
}

function formMembers() {
  const list = activeMembers();
  if (form.editingId) {
    const c = data.collections.find((x) => x.id === form.editingId);
    for (const e of c.entries) {
      if (!list.some((m) => m.id === e.memberId)) list.push(findMember(e.memberId));
    }
  }
  return list;
}

function formShare(m) {
  if (form.mode === "grade") {
    const key = String(gradeOf(m)) + (form.byGender && m.gender === "女" ? "F" : "");
    return form.gradePrices[key] || 0;
  }
  if (form.mode === "equal") return form.equalAmount;
  return form.custom[m.id] || 0;
}

function formTotal() {
  return formMembers().filter((m) => form.selected.includes(m.id)).reduce((s, m) => s + formShare(m), 0);
}

function renderFormMode() {
  document.querySelectorAll("#form-mode .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === form.mode));
  document.getElementById("form-grade-box").hidden = form.mode !== "grade";
  document.getElementById("price-label-m").hidden = !form.byGender;
  document.getElementById("price-row-f").hidden = !form.byGender;
  document.getElementById("form-equal-box").hidden = form.mode !== "equal";
  const hints = {
    grade: "学年ごとの金額を入れると、一人ずつの額が自動で入ります。前回の金額を引き継いでいます。",
    equal: "参加者全員を同じ金額にします。",
    custom: "次の画面で、一人ずつ金額を入れます。"
  };
  document.getElementById("form-mode-hint").textContent = hints[form.mode];
}

function renderFormStep() {
  for (const n of [1, 2, 3]) document.getElementById("form-step-" + n).classList.toggle("active", form.step === n);
  document.querySelectorAll("#form-stepper li").forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle("is-now", n === form.step);
    li.classList.toggle("is-past", n < form.step);
  });
  if (form.step === 2) renderFormMembers();
  if (form.step === 3) renderFormConfirm();
  document.getElementById("btn-form-next").textContent = form.step === 3 ? "保存する" : "次へ";
  document.getElementById("btn-form-delete").hidden = !(form.step === 3 && form.editingId);
  renderFormFooter();
  window.scrollTo(0, 0);
}

function renderFormFooter() {
  const info = document.getElementById("form-footer-info");
  info.innerHTML = form.step === 1 ? "" : `
    <span class="footer-small">参加 ${form.selected.length}人</span>
    <span class="footer-big num">集める合計 ${yen(formTotal())}</span>`;
}

function renderFormMembers() {
  let html = "";
  for (const group of GROUPS) {
    const inGroup = formMembers().filter((m) => gradeOf(m) === group.key);
    if (inGroup.length === 0) continue;
    let price = "";
    if (form.mode === "grade") {
      const key = String(group.key);
      price = form.byGender
        ? `男 ${yen(form.gradePrices[key] || 0)} / 女 ${yen(form.gradePrices[key + "F"] || 0)}`
        : yen(form.gradePrices[key] || 0);
    }
    const rows = inGroup.map((m) => {
      const on = form.selected.includes(m.id);
      let right = "";
      if (!on) right = `<span class="pick-note">不参加</span>`;
      else if (form.mode === "custom") {
        right = `<input class="input" type="text" inputmode="numeric" autocomplete="off" data-amount aria-label="${m.name}の金額" data-custom-id="${m.id}" value="${amountText(form.custom[m.id])}">`;
      } else right = `<span class="pick-note num">${yen(formShare(m))}</span>`;
      const gender = form.mode === "grade" && form.byGender
        ? `<span class="gender${m.gender ? "" : " is-missing"}">${m.gender ? genderLabel(m) : "性別未設定(男子の金額)"}</span>` : "";
      return `
        <div class="pick${on ? "" : " is-off"}">
          <label class="pick-check">
            <input type="checkbox" data-select-id="${m.id}" ${on ? "checked" : ""}>
            <span>${m.name}${gender}</span>
          </label>
          ${right}
        </div>`;
    }).join("");
    html += `<p class="group-head"><span>${group.title}</span><span class="num">${price}</span></p><div class="sheet-list">${rows}</div>`;
  }
  document.getElementById("form-members").innerHTML = html || emptyBox("名簿にメンバーがいません。先に名簿に追加してください", "add-members", "メンバーを追加");
}

function renderFormConfirm() {
  const rows = [["名前", form.title], ["日付", shortDate(form.date)]];
  if (form.kind === "イベント") rows.push(["種類", form.eventType]);
  rows.push(["割り方", modeLabel(form)], ["参加者", `${form.selected.length}人`], ["集める合計", `<span class="num">${yen(formTotal())}</span>`]);
  document.getElementById("form-confirm").innerHTML = rows
    .map(([l, v]) => `<div class="confirm-row"><span>${l}</span><span>${v}</span></div>`).join("");
  document.getElementById("form-confirm-note").textContent = form.kind === "イベント" && !form.editingId
    ? "保存したあと、宿代やお店の会計は詳細画面の「払ったもの」から記録します。立て替えた人もそこで選べます。" : "";
}

function formNext() {
  if (form.step === 1) {
    form.title = document.getElementById("form-title").value.trim();
    form.date = document.getElementById("form-date").value;
    if (!form.title) return alert("名前を入れてください");
    if (!form.date) return alert("日付を入れてください");
  }
  if (form.step === 2 && form.selected.length === 0) return alert("参加者を1人以上選んでください");
  if (form.step < 3) {
    form.step += 1;
    renderFormStep();
    return;
  }
  saveForm();
}

function formBack() {
  if (form.step > 1) {
    form.step -= 1;
    renderFormStep();
    return;
  }
  if (form.editingId) goTo("detail");
  else goTo("tab");
}

function saveForm() {
  const old = data.collections.find((x) => x.id === form.editingId);
  if (old) {
    const removedPaid = old.entries.filter((e) => e.done && !form.selected.includes(e.memberId));
    if (removedPaid.length > 0) {
      const names = removedPaid.map((e) => findMember(e.memberId).name).join("、");
      if (!confirm(`${names}さんは支払い済みです。外すと返金が必要になります。外しますか?`)) return;
    }
  }
  const entries = formMembers().filter((m) => form.selected.includes(m.id)).map((m) => {
    const prev = old ? old.entries.find((e) => e.memberId === m.id) : null;
    return { memberId: m.id, share: formShare(m), done: prev ? prev.done : false };
  });
  const c = {
    ...(old || {}),
    id: form.editingId || newId("c"),
    kind: form.kind,
    eventType: form.kind === "イベント" ? form.eventType : undefined,
    title: form.title,
    date: form.date,
    mode: form.mode,
    byGender: form.mode === "grade" && form.byGender,
    equalAmount: form.equalAmount,
    gradePrices: { ...form.gradePrices },
    entries,
    payments: old ? old.payments || [] : []
  };
  if (old) data.collections[data.collections.indexOf(old)] = c;
  else data.collections.push(c);
  saveData();
  currentCollectionId = c.id;
  goTo("detail");
  showToast("保存しました");
}


// ===== 13. 下から出る入力画面 =====

let rform = null;   // 支出・収入
let pform = null;   // イベントで払ったもの

function openSheet(name) {
  for (const n of ["record", "payment", "settings"]) {
    document.getElementById("sheet-" + n).hidden = n !== name;
  }
  document.getElementById("sheet").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  document.getElementById("sheet").hidden = true;
  document.body.style.overflow = "";
}

function payerOptions(clubLabel) {
  return `<option value="">${clubLabel}</option>` + activeMembers()
    .filter((m) => gradeOf(m) !== "OB")
    .map((m) => `<option value="${m.id}">${m.name}さんが立替</option>`).join("");
}

function frequentPlaces(category) {
  const places = [];
  for (const x of [...data.expenses].filter((x) => x.category === category && x.place).sort((a, b) => (a.date < b.date ? 1 : -1))) {
    let p = places.find((y) => y.name === x.place);
    if (!p) {
      p = { name: x.place, amount: x.amount, time: x.time, count: 0 };
      places.push(p);
    }
    p.count += 1;
  }
  return places.sort((a, b) => b.count - a.count).slice(0, 5);
}

function openRecord(type, id) {
  const list = type === "expense" ? data.expenses : data.incomes;
  const record = list.find((r) => r.id === id);
  if (record && isLocked(record.date)) {
    alert("締めた年度の記録は変更できません");
    return;
  }
  rform = record ? { type, ...copy(record) } : {
    type, id: null, date: isoDate(new Date()), category: "ground", amount: 0,
    place: "", time: "", payerId: null, reimbursed: false, title: "", memo: ""
  };
  document.getElementById("rf-amount").value = amountText(rform.amount);
  document.getElementById("rf-date").value = rform.date;
  document.getElementById("rf-income-date").value = rform.date;
  document.getElementById("rf-place").value = rform.place || "";
  document.getElementById("rf-time").value = rform.time || "";
  document.getElementById("rf-title").value = rform.title || "";
  document.getElementById("rf-memo").value = rform.memo || "";
  document.getElementById("rf-payer").innerHTML = payerOptions("サークル費から");
  document.getElementById("rf-payer").value = rform.payerId || "";
  document.getElementById("btn-rf-delete").hidden = !rform.id;
  document.getElementById("btn-rf-save").textContent = rform.id ? "保存する" : "記録する";
  renderRecordParts();
  openSheet("record");
}

function renderRecordParts() {
  const isExpense = rform.type === "expense";
  document.querySelectorAll("#rf-type .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === rform.type));
  document.getElementById("rf-expense-box").hidden = !isExpense;
  document.getElementById("rf-income-box").hidden = isExpense;
  document.getElementById("rf-categories").innerHTML = CATEGORIES.map((c) =>
    `<button class="chip${c.key === rform.category ? " active" : ""}" data-category="${c.key}">${c.label}</button>`).join("");
  document.getElementById("rf-places").innerHTML = frequentPlaces(rform.category).map((p) =>
    `<button class="chip${p.name === rform.place ? " active" : ""}" data-place="${p.name}">${p.name} ${yen(p.amount)}</button>`).join("");
}

function saveRecord() {
  rform.amount = toAmount(document.getElementById("rf-amount").value);
  rform.memo = document.getElementById("rf-memo").value.trim();
  rform.date = document.getElementById(rform.type === "expense" ? "rf-date" : "rf-income-date").value;
  if (rform.amount === 0) return alert("金額を入れてください");
  if (!rform.date) return alert("日付を入れてください");
  if (isLocked(rform.date)) return alert("締めた年度の日付には記録できません");

  if (rform.type === "expense") {
    rform.place = document.getElementById("rf-place").value.trim();
    rform.time = document.getElementById("rf-time").value.trim();
    rform.payerId = document.getElementById("rf-payer").value || null;
    if (!rform.payerId) rform.reimbursed = false;
    upsert(data.expenses, {
      id: rform.id || newId("x"), date: rform.date, category: rform.category, amount: rform.amount,
      place: rform.place, time: rform.time, payerId: rform.payerId, reimbursed: rform.reimbursed, memo: rform.memo
    });
  } else {
    rform.title = document.getElementById("rf-title").value.trim() || "その他の収入";
    upsert(data.incomes, { id: rform.id || newId("i"), date: rform.date, title: rform.title, amount: rform.amount, memo: rform.memo });
  }
  saveData();
  closeSheet();
  rerender();
  showToast(rform.id ? "保存しました" : `${yen(rform.amount)} を記録しました`);
}

function upsert(list, record) {
  const i = list.findIndex((r) => r.id === record.id);
  if (i >= 0) list[i] = record;
  else list.push(record);
}

function deleteRecord() {
  closeSheet();
  commit("記録を削除しました", () => {
    if (rform.type === "expense") data.expenses = data.expenses.filter((r) => r.id !== rform.id);
    else data.incomes = data.incomes.filter((r) => r.id !== rform.id);
  });
}

function openPayment(id) {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  const p = (c.payments || []).find((x) => x.id === id);
  pform = p ? copy(p) : { id: null, title: "", amount: 0, payerId: null, reimbursed: false };
  document.getElementById("pf-amount").value = amountText(pform.amount);
  document.getElementById("pf-title").value = pform.title;
  document.getElementById("pf-payer").innerHTML = payerOptions("会計が支払い(集めたお金から)");
  document.getElementById("pf-payer").value = pform.payerId || "";
  document.getElementById("btn-pf-delete").hidden = !pform.id;
  openSheet("payment");
}

function savePayment() {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  pform.amount = toAmount(document.getElementById("pf-amount").value);
  pform.title = document.getElementById("pf-title").value.trim() || "支払い";
  const payer = document.getElementById("pf-payer").value || null;
  if (payer !== pform.payerId) pform.reimbursed = false;
  pform.payerId = payer;
  if (pform.amount === 0) return alert("金額を入れてください");
  c.payments = c.payments || [];
  upsert(c.payments, { ...pform, id: pform.id || newId("p") });
  saveData();
  closeSheet();
  renderDetail();
  showToast("記録しました");
}

function deletePayment() {
  closeSheet();
  commit(`「${pform.title}」を削除しました`, () => {
    const c = data.collections.find((x) => x.id === currentCollectionId);
    c.payments = c.payments.filter((p) => p.id !== pform.id);
  });
}

function openSettings() {
  document.getElementById("st-date").value = data.settings.startDate;
  document.getElementById("st-balance").value = amountText(data.settings.startBalance);
  openSheet("settings");
}

function saveSettings() {
  const date = document.getElementById("st-date").value;
  if (!date) return alert("日付を入れてください");
  data.settings.startDate = date;
  data.settings.startBalance = toAmount(document.getElementById("st-balance").value);
  saveData();
  closeSheet();
  rerender();
  showToast("保存しました");
}

// 表示中の年度の帳簿をCSVで保存する
function exportCsv() {
  const items = ledgerItems().filter((i) => schoolYearOf(i.date) === selectedYear).reverse();
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["日付", "内容", "入り", "出", "メモ"]];
  for (const i of items) {
    rows.push([i.date, i.title, i.amount > 0 ? i.amount : "", i.amount < 0 ? -i.amount : "", i.memo || ""]);
  }
  const csv = "﻿" + rows.map((r) => r.map(quote).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const stamp = isoDate(new Date()).replace(/-/g, "");
  link.download = `circle-kaikei_${selectedYear}_${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("CSVを保存しました");
}


// ===== 14. 操作 =====

$("tabbar").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) goTo(tab.dataset.tab);
});

// 画面全体で共通のボタン
document.addEventListener("click", (e) => {
  const t = e.target;
  const back = t.closest("[data-back]");
  if (back) return goTo(back.dataset.back);
  const gotoBtn = t.closest("[data-goto]");
  if (gotoBtn) return goTo(gotoBtn.dataset.goto);
  const month = t.closest("[data-month]");
  if (month) {
    openMonths[month.dataset.month] = month.getAttribute("aria-expanded") !== "true";
    return rerender();
  }
  const copyBtn = t.closest("[data-copy-month]");
  if (copyBtn) return copyMonth(copyBtn.dataset.copyMonth);
  const line = t.closest("[data-ledger-type]");
  if (line) {
    if (line.dataset.ledgerType === "collection") return openCollection(line.dataset.ledgerId);
    return openRecord(line.dataset.ledgerType, line.dataset.ledgerId);
  }
  const col = t.closest("[data-collection-id]");
  if (col) return openCollection(col.dataset.collectionId);
  const re = t.closest("[data-reimburse]");
  if (re) return reimburse(re.dataset.reimburse);
  const action = t.closest("[data-action]");
  if (action) {
    const actions = {
      "add-record": () => openRecord("expense", null),
      "add-expense": () => openRecord("expense", null),
      "add-event": () => openForm("イベント", null),
      "add-members": openBulk,
      "add-payment": () => openPayment(null),
      "clear-filter": clearSpendFilter
    };
    return actions[action.dataset.action]();
  }
  if (t.closest("#btn-dues-new")) return openForm("部費", null);
  if (t.closest("#btn-year-close")) return closeYear();
  if (t.closest("#btn-filter-clear")) return clearSpendFilter();
});

function clearSpendFilter() {
  spendCategory = "all";
  spendPayer = "all";
  spendSearch = "";
  renderSpend();
}

// 金額の入力欄:全角→半角、数字以外を除き、カンマをつける
// (日本語入力の変換中は触らず、確定してから整える)
function tidyAmount(input) {
  const text = amountText(toAmount(input.value));
  if (input.value !== text) input.value = text;
}
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-amount]") && !e.isComposing) tidyAmount(e.target);
}, true);
document.addEventListener("compositionend", (e) => {
  if (e.target.matches("[data-amount]")) tidyAmount(e.target);
});

// お知らせの「元に戻す」
$("toast-undo").addEventListener("click", () => {
  const undo = toastUndo;
  hideToast();
  if (undo) undo();
});

// 年度の切り替え(どの画面でも同じ年度にそろえる)
document.addEventListener("change", (e) => {
  if (!e.target.matches("[data-year-select]")) return;
  selectedYear = Number(e.target.value);
  openMonths = {};
  rerender();
});

// ① 帳簿
$("btn-home-add").addEventListener("click", () => openRecord("expense", null));
$("btn-settings").addEventListener("click", openSettings);

// ② 支出・精算
$("btn-spend-add").addEventListener("click", () => openRecord("expense", null));
$("spend-cats").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  spendCategory = spendCategory === b.dataset.cat ? "all" : b.dataset.cat;
  renderSpend();
});
$("spend-payer").addEventListener("change", (e) => {
  spendPayer = e.target.value;
  renderSpend();
});
$("spend-search").addEventListener("input", (e) => {
  spendSearch = e.target.value.trim();
  clearTimeout($("spend-search").timer);
  $("spend-search").timer = setTimeout(() => {
    renderSpend();
    $("spend-search").focus();
  }, 300);
});

// ③ イベント
$("btn-events-add").addEventListener("click", () => openForm("イベント", null));

// 名簿
$("btn-members-add").addEventListener("click", openBulk);
$("members-filter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-members-filter]");
  if (!b) return;
  membersFilter = b.dataset.membersFilter;
  renderMembers();
});
$("members-show-ob").addEventListener("change", (e) => {
  showOB = e.target.checked;
  renderMembers();
});
$("members-groups").addEventListener("click", (e) => {
  const row = e.target.closest("[data-member-id]");
  if (row) openMember(row.dataset.memberId);
});
$("btn-bulk-add").addEventListener("click", addMembersInBulk);
$("btn-member-save").addEventListener("click", saveMember);
$("btn-member-remove").addEventListener("click", removeMember);

// 集金の詳細
$("detail-members").addEventListener("click", (e) => {
  const row = e.target.closest("[data-entry-member]");
  if (!row) return;
  const c = data.collections.find((x) => x.id === currentCollectionId);
  const entry = c.entries.find((en) => en.memberId === row.dataset.entryMember);
  const name = findMember(entry.memberId).name;
  commit(`${name}さんを${entry.done ? "未払い" : "支払い済み"}にしました`, () => {
    entry.done = !entry.done;
  }, renderDetail);
});
$("detail-payments").addEventListener("click", (e) => {
  const row = e.target.closest("[data-payment-id]");
  if (row) openPayment(row.dataset.paymentId);
});
$("btn-payment-add").addEventListener("click", () => openPayment(null));
$("btn-edit").addEventListener("click", () => {
  const c = data.collections.find((x) => x.id === currentCollectionId);
  openForm(c.kind, c.id);
});
$("btn-copy-unpaid").addEventListener("click", copyUnpaid);
$("btn-close-event").addEventListener("click", toggleClose);

// 集金を作る
$("btn-form-next").addEventListener("click", formNext);
$("btn-form-back").addEventListener("click", formBack);
$("form-stepper").addEventListener("click", (e) => {
  const li = e.target.closest("[data-step]");
  if (li && Number(li.dataset.step) < form.step) {
    form.step = Number(li.dataset.step);
    renderFormStep();
  }
});
$("form-types").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-event-type]");
  if (!chip) return;
  form.eventType = chip.dataset.eventType;
  renderFormTypes();
});
$("form-mode").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (!b) return;
  if (b.dataset.mode === "custom" && form.mode !== "custom") {
    for (const m of formMembers()) form.custom[m.id] = formShare(m);
  }
  form.mode = b.dataset.mode;
  renderFormMode();
});
$("form-by-gender").addEventListener("change", (e) => {
  form.byGender = e.target.checked;
  renderFormMode();
});
$("form-grade-prices").addEventListener("input", (e) => {
  form.gradePrices[e.target.dataset.gradeKey] = toAmount(e.target.value);
});
$("form-equal").addEventListener("input", (e) => {
  form.equalAmount = toAmount(e.target.value);
});
$("form-members").addEventListener("change", (e) => {
  const id = e.target.dataset.selectId;
  if (!id) return;
  if (e.target.checked) form.selected.push(id);
  else form.selected = form.selected.filter((x) => x !== id);
  renderFormMembers();
  renderFormFooter();
});
$("form-members").addEventListener("input", (e) => {
  const id = e.target.dataset.customId;
  if (!id) return;
  form.custom[id] = toAmount(e.target.value);
  renderFormFooter();
});
$("btn-all-on").addEventListener("click", () => {
  form.selected = formMembers().map((m) => m.id);
  renderFormMembers();
  renderFormFooter();
});
$("btn-all-off").addEventListener("click", () => {
  form.selected = [];
  renderFormMembers();
  renderFormFooter();
});
$("btn-form-delete").addEventListener("click", () => {
  const id = form.editingId;
  commit(`「${form.title}」を削除しました`, () => {
    data.collections = data.collections.filter((x) => x.id !== id);
  }, () => goTo("tab"));
});

// 入力画面
$("sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-sheet-close]")) closeSheet();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("sheet").hidden) closeSheet();
});
$("rf-type").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  rform.type = b.dataset.type;
  renderRecordParts();
});
$("rf-categories").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  rform.category = chip.dataset.category;
  renderRecordParts();
});
$("rf-places").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-place]");
  if (!chip) return;
  const p = frequentPlaces(rform.category).find((x) => x.name === chip.dataset.place);
  rform.place = p.name;
  $("rf-place").value = p.name;
  $("rf-amount").value = amountText(p.amount);
  if ($("rf-time").value === "") $("rf-time").value = p.time || "";
  renderRecordParts();
});
$("rf-place").addEventListener("input", (e) => {
  rform.place = e.target.value.trim();
  renderRecordParts();
});
$("btn-rf-save").addEventListener("click", saveRecord);
$("btn-rf-delete").addEventListener("click", deleteRecord);
$("btn-pf-save").addEventListener("click", savePayment);
$("btn-pf-delete").addEventListener("click", deletePayment);
$("btn-st-save").addEventListener("click", saveSettings);
$("btn-export").addEventListener("click", exportCsv);
$("btn-reset").addEventListener("click", () => {
  if (!confirm("入力したデータを消して、サンプルデータに戻しますか?")) return;
  data = copy(sampleData);
  saveData();
  closeSheet();
  selectedYear = SY;
  goTo("home");
  showToast("サンプルデータに戻しました");
});
$("btn-clear").addEventListener("click", () => {
  if (!confirm("名簿も記録もすべて消して、空の状態から始めますか?")) return;
  data = copy(emptyData);
  saveData();
  closeSheet();
  selectedYear = SY;
  goTo("home");
  showToast("すべて消しました");
});


// ===== 15. 最初の画面 =====

goTo("home");