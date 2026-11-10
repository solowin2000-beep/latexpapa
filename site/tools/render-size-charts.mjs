/*
 * Renders the five size charts as clean WebP images into site/img/size-charts/.
 *
 * Why this exists: the supplier's ready-made charts are images, and an image cannot be
 * checked by a script - the women's chart shipped with the label column shifted one row
 * against the values (so "Waist Circumference" showed the chest inches), plus two typos.
 * Here cm is the single source of truth and the inch column is COMPUTED, so the two
 * columns can never drift apart again. A consistency check runs before anything is written.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("site/img/size-charts");
const SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];

const W = 1600;
const PAD = 22;
const IN = 22;
const TITLE_H = 92;
const LINE_H = 30;

const C = {
  card: "#ffffff", frame: "#e2e6ee",
  ink: "#141821", muted: "#6b7280",
  head: "#1b1e27", headInk: "#ffffff",
  stripe: "#f5f6fa", line: "#e0e4ec", accent: "#d8203f",
};
const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

// ---------------------------------------------------------------- text metrics
const CW = { I: 0.30, J: 0.42, L: 0.48, M: 0.86, W: 0.88, " ": 0.28, ".": 0.30, ",": 0.30,
  "-": 0.42, "\u2013": 0.58, "&": 0.72, "'": 0.22, "?": 0.50, "/": 0.36, ":": 0.30, "+": 0.60,
  "0": 0.60, "1": 0.40, "2": 0.58, "3": 0.56, "4": 0.60, "5": 0.56, "6": 0.58, "7": 0.50, "8": 0.58, "9": 0.58 };
const w1 = (ch) => CW[ch] != null ? CW[ch] : (/[A-Z]/.test(ch) ? 0.66 : /[a-z]/.test(ch) ? 0.56 : 0.6);
const measure = (s, fs) => [...String(s)].reduce((a, c) => a + w1(c) * fs, 0);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fit(text, maxW, base, min) {
  let fs = base;
  while (fs > min && measure(text, fs) > maxW) fs -= 1;
  return fs;
}
function wrapTo(text, maxW, fs) {
  const words = String(text).split(/\s+/);
  const out = []; let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && measure(next, fs) > maxW) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
// cm -> inch, 1 dp, trailing .0 stripped
const inch = (cm) => String(Math.round((Number(cm) / 2.54) * 10) / 10);

// ---------------------------------------------------------------- data (cm)
const WOMEN = [
  ["Height", [150, 155, 160, 165, 170, 175, 180, 185, 185, 190, 190, 195, 195]],
  ["Neck Circumference", [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]],
  ["Chest Circumference", [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130]],
  ["Waist Circumference", [52, 57.2, 62.4, 67.6, 72.8, 78, 83.2, 88.4, 93.6, 98.8, 104, 109.2, 114.4]],
  ["Hip Circumference", [75, 79.8, 84.6, 89.4, 94.2, 99, 103.8, 108.6, 113.4, 118.2, 123, 127.8, 132.6]],
  ["Upper Body Length", [142, 145, 148, 151, 154, 157, 160, 163, 163, 166, 166, 169, 169]],
  ["Upper Arm Circumference", [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]],
  ["Inseam", [44, 45, 46, 47, 48, 49, 50, 51, 51, 52, 52, 53, 53]],
  ["Leg Length", [60, 62, 64, 66, 68, 70, 72, 74, 74, 76, 76, 78, 78]],
  ["Thigh Circumference", [44, 46.1, 48.2, 50.3, 52.4, 54.5, 56.6, 58.7, 60.8, 62.9, 65, 67.1, 69.2]],
  ["Knee Circumference", [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43]],
  ["Calf Circumference", [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]],
  ["Ankle Circumference", [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]],
  ["Wrist Circumference", [16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22]],
];
const MEN = [
  ["Height", [160, 165, 170, 175, 180, 185, 190, 195, 195, 200, 200, 205, 205]],
  ["Neck Circumference", [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]],
  ["Chest Circumference", [75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135]],
  ["Waist Circumference", [60, 65.2, 70.4, 75.6, 80.8, 86, 91.2, 96.4, 101.6, 106.8, 112, 117.2, 122.4]],
  ["Hip Circumference", [75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135]],
  ["Upper Body Length", [149, 152, 155, 158, 161, 164, 167, 170, 170, 173, 173, 176, 176]],
  ["Upper Arm Circumference", [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]],
  ["Inseam", [46, 47, 48, 49, 50, 51, 52, 53, 53, 54, 54, 55, 55]],
  ["Leg Length", [66, 68, 70, 72, 74, 76, 78, 80, 80, 82, 82, 84, 84]],
  ["Thigh Circumference", [45.1, 47.2, 49.3, 51.4, 53.5, 55.6, 57.7, 59.8, 61.9, 64, 66.1, 68.2, 70.3]],
  ["Knee Circumference", [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]],
  ["Calf Circumference", [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]],
  ["Ankle Circumference", [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]],
  ["Wrist Circumference", [16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22]],
];
const MASK = [
  ["Head Vertical Circumference", [60, 63, 65, 68, 70, 73]],
  ["Head Horizontal Circumference", [48.5, 53, 57, 60, 64, 65]],
  ["Neck Circumference", [30.5, 32.5, 37, 40, 41, 41.5]],
];
const MASK_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const clothesRows = (rows) => rows.map(([label, cms]) => ({
  label, cells: cms.map((cm) => [String(cm), inch(cm)]),
}));

const CHARTS = [
  { key: "women", title: "Women's clothing size chart (cm / inches)", labelCol: "Measurement", labelW: 300, cols: SIZES, rows: clothesRows(WOMEN) },
  { key: "men", title: "Men's clothing size chart (cm / inches)", labelCol: "Measurement", labelW: 300, cols: SIZES, rows: clothesRows(MEN) },
  {
    key: "gloves", title: "Glove size chart (cm)", labelCol: "Size", labelW: 250,
    cols: [["Wrist"], ["Palm"], ["Bicep"], ["Top Of Middle", "Finger to Wrist"], ["Length"]],
    rows: [
      { label: "Small", cells: [["15"], ["16"], ["25"], ["17"], ["58"]] },
      { label: "Medium", cells: [["16"], ["18"], ["27"], ["18"], ["59"]] },
      { label: "Large", cells: [["17"], ["19"], ["27.5"], ["19"], ["59.5"]] },
    ],
  },
  { key: "mask", title: "Hood and mask size chart (cm / inches)", labelCol: "Measurement", labelW: 330, cols: MASK_SIZES, rows: clothesRows(MASK) },
  {
    key: "socks", title: "Stocking and sock size chart", labelCol: "To fit", labelW: 260,
    cols: [["XS"], ["S"], ["M"], ["L"], ["XL"], ["XXL"], ["3XL"], ["4XL"]],
    rows: [
      { label: "Below knee (cm)", cells: [["29.5\u201331"], ["31\u201332.5"], ["32.5\u201334"], ["34\u201335.5"], ["35.5\u201337"], ["37\u201338.5"], ["38.5\u201340"], ["40\u201341.5"]] },
      { label: "Ankle (cm)", cells: [["18\u201320"], ["20\u201321"], ["21\u201323"], ["23\u201325"], ["25\u201327"], ["27\u201329"], ["29\u201331"], ["31\u201333"]] },
      { label: "Length (cm)", cells: [["35\u201340"], ["35\u201340"], ["35\u201340"], ["35\u201340"], ["40\u201345"], ["40\u201345"], ["40\u201345"], ["40\u201345"]] },
      { label: "Foot size", cells: [["UK 3\u20137", "EU 36\u201341"], ["UK 3\u20137", "EU 36\u201341"], ["UK 3\u20137", "EU 36\u201341"], ["UK 5\u20139", "EU 38\u201343"], ["UK 5\u20139", "EU 38\u201343"], ["UK 5\u20139", "EU 38\u201343"], ["UK 5\u20139", "EU 38\u201343"], ["UK 5\u20139", "EU 38\u201343"]] },
    ],
  },
];

// ---------------------------------------------------------------- consistency check
const problems = [];
for (const chart of CHARTS) {
  for (const row of chart.rows) {
    for (const cell of row.cells) {
      if (cell.length === 2 && /^[0-9.]+$/.test(cell[0]) && /^[0-9.]+$/.test(cell[1])) {
        const want = Math.round((Number(cell[0]) / 2.54) * 10) / 10;
        if (Math.abs(want - Number(cell[1])) > 0.05) problems.push(chart.key + " / " + row.label + ": " + cell[0] + "cm -> " + cell[1] + "in (expected " + want + ")");
      }
      if (row.cells.length !== chart.cols.length) problems.push(chart.key + " / " + row.label + ": " + row.cells.length + " cells for " + chart.cols.length + " columns");
    }
  }
}
if (problems.length) { console.error("SIZE CHART DATA IS INCONSISTENT:"); for (const p of problems) console.error(" - " + p); process.exit(1); }

// ---------------------------------------------------------------- renderer
function renderChart(ch) {
  const nCols = ch.cols.length;
  const tableW = W - 2 * (PAD + IN);
  const labelW = ch.labelW;
  const colW = (tableW - labelW) / nCols;

  const headCols = ch.cols.map((c) => (Array.isArray(c) ? c : [c]));
  const headMaxLines = Math.max(...headCols.map((h) => h.length));
  const headH = headMaxLines * 30 + 26;

  const meta = ch.rows.map((r) => {
    const labelLines = wrapTo(r.label, labelW - 30, 24);
    const cells = r.cells.map((c) => (Array.isArray(c) ? c : [c]));
    const maxLines = Math.max(labelLines.length, ...cells.map((c) => c.length));
    return { r, labelLines, cells, h: Math.max(58, maxLines * LINE_H + 22) };
  });

  const bodyH = meta.reduce((a, m) => a + m.h, 0);
  const cardH = IN + TITLE_H + headH + bodyH + IN;
  const H = cardH + 2 * PAD;

  const x0 = PAD + IN;
  const y0 = PAD + IN;

  const out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
  out.push('<rect width="' + W + '" height="' + H + '" fill="' + C.card + '"/>');
  out.push('<rect x="' + PAD + '" y="' + PAD + '" width="' + (W - 2 * PAD) + '" height="' + (H - 2 * PAD) + '" rx="18" fill="#ffffff" stroke="' + C.frame + '" stroke-width="2"/>');

  // title
  const titleFs = fit(ch.title, tableW - 40, 46, 30);
  out.push('<text x="' + (W / 2) + '" y="' + (y0 + 52) + '" text-anchor="middle" font-family="' + FONT + '" font-size="' + titleFs + '" font-weight="700" fill="' + C.ink + '">' + esc(ch.title) + "</text>");
  out.push('<rect x="' + (W / 2 - 70) + '" y="' + (y0 + 70) + '" width="140" height="5" rx="2.5" fill="' + C.accent + '"/>');

  const tableX = x0;
  const tableY = y0 + TITLE_H;
  const headY = tableY;

  // header band
  out.push('<rect x="' + tableX + '" y="' + headY + '" width="' + tableW + '" height="' + headH + '" fill="' + C.head + '"/>');
  out.push('<text x="' + (tableX + 16) + '" y="' + (headY + headH / 2 + 9) + '" font-family="' + FONT + '" font-size="26" font-weight="700" fill="' + C.headInk + '">' + esc(ch.labelCol) + "</text>");
  headCols.forEach((lines, i) => {
    const cx = tableX + labelW + colW * i + colW / 2;
    const blockTop = headY + (headH - lines.length * 30) / 2;
    lines.forEach((ln, k) => {
      const fs = fit(ln, colW - 14, 26, 15);
      out.push('<text x="' + cx + '" y="' + (blockTop + k * 30 + 22) + '" text-anchor="middle" font-family="' + FONT + '" font-size="' + fs + '" font-weight="700" fill="' + C.headInk + '">' + esc(ln) + "</text>");
    });
  });

  // body
  let y = headY + headH;
  meta.forEach((m, ri) => {
    if (ri % 2 === 1) out.push('<rect x="' + tableX + '" y="' + y + '" width="' + tableW + '" height="' + m.h + '" fill="' + C.stripe + '"/>');
    // label
    const lb = m.labelLines;
    const lTop = y + (m.h - lb.length * LINE_H) / 2;
    lb.forEach((ln, k) => {
      const fs = fit(ln, labelW - 30, 24, 15);
      out.push('<text x="' + (tableX + labelW / 2) + '" y="' + (lTop + k * LINE_H + 22) + '" text-anchor="middle" font-family="' + FONT + '" font-size="' + fs + '" font-weight="600" fill="' + C.ink + '">' + esc(ln) + "</text>");
    });
    // cells
    m.cells.forEach((lines, ci) => {
      const cx = tableX + labelW + colW * ci + colW / 2;
      const top = y + (m.h - lines.length * LINE_H) / 2;
      lines.forEach((ln, k) => {
        const isInch = lines.length === 2 && k === 1 && /^[0-9.]+$/.test(lines[0]) && /^[0-9.]+$/.test(lines[1]);
        const base = isInch ? 21 : 26;
        const fs = fit(ln, colW - 12, base, 14);
        const fill = isInch ? C.muted : C.ink;
        const weight = isInch ? 400 : 600;
        out.push('<text x="' + cx + '" y="' + (top + k * LINE_H + 22) + '" text-anchor="middle" font-family="' + FONT + '" font-size="' + fs + '" font-weight="' + weight + '" fill="' + fill + '">' + esc(ln) + "</text>");
      });
    });
    // separators
    out.push('<line x1="' + tableX + '" y1="' + (y + m.h) + '" x2="' + (tableX + tableW) + '" y2="' + (y + m.h) + '" stroke="' + C.line + '" stroke-width="1"/>');
    out.push('<line x1="' + (tableX + labelW) + '" y1="' + y + '" x2="' + (tableX + labelW) + '" y2="' + (y + m.h) + '" stroke="' + C.line + '" stroke-width="1"/>');
    for (let ci = 1; ci < nCols; ci++) {
      const vx = tableX + labelW + colW * ci;
      out.push('<line x1="' + vx + '" y1="' + y + '" x2="' + vx + '" y2="' + (y + m.h) + '" stroke="' + C.line + '" stroke-width="1"/>');
    }
    y += m.h;
  });

  out.push("</svg>");
  return { svg: out.join("\n"), width: W, height: H };
}

// ---------------------------------------------------------------- output
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const ch of CHARTS) {
  const { svg, width, height } = renderChart(ch);
  const file = path.join(OUT, ch.key + ".webp");
  const info = await sharp(Buffer.from(svg)).webp({ quality: 88, effort: 5 }).toFile(file);
  manifest[ch.key] = { file: "/img/size-charts/" + ch.key + ".webp", width: info.width, height: info.height, title: ch.title };
  console.log(ch.key.padEnd(8) + info.width + "x" + info.height + "  " + (info.size / 1024).toFixed(0) + "KB");
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("wrote " + Object.keys(manifest).length + " charts to " + OUT);