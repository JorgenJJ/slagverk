// Lager gjennomsiktige, linje-bare varianter av Randaberg-logoen:
//   public/randaberg-logo-white.png  (hvite linjer på transparent)
//   public/randaberg-logo-red.png    (røde linjer på transparent)
// Kjør:  node scripts/make-logo-variants.js
//
// Teknikk: kildelogoen er et rødt skjold med hvit strek/krest på HVIT bakgrunn.
// 1) flood-fill fra kantene over hvite piksler → markér bakgrunn,
// 2) for ikke-bakgrunn brukes "hvithet" (min(G,B)) som alfa, så den røde
//    skjoldflaten blir transparent og kun den hvite streken står igjen,
// 3) farg streken hvit eller rød.

const sharp = require("sharp");
const path = require("path");

const SRC = path.join(__dirname, "..", "public", "randaberg-logo.png");
const OUT_WHITE = path.join(__dirname, "..", "public", "randaberg-logo-white.png");
const OUT_RED = path.join(__dirname, "..", "public", "randaberg-logo-red.png");
const RED = [0xc8, 0x10, 0x2e];
const LO = 85; // under denne "hvitheten" => transparent (fjerner rød flate)

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const isWhite = (i) => data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200;

  // Flood-fill bakgrunn fra alle kantpiksler som er hvite.
  const bg = new Uint8Array(W * H);
  const stack = [];
  const seed = (x, y) => { const p = y * W + x; if (!bg[p] && isWhite(p * 4)) { bg[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
  for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p / W) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < W - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < H - 1) seed(x, y + 1);
  }

  // Bygg alfa-maske (anti-aliaset) av den hvite streken.
  const alpha = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (bg[p]) continue;
    const i = p * 4, m = Math.min(data[i + 1], data[i + 2]); // grønn/blå lav i rødt, høy i hvitt
    alpha[p] = Math.max(0, Math.min(255, Math.round(((m - LO) / (255 - LO)) * 255)));
  }

  const buildPng = (rgb, out) => {
    const o = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H; p++) { const i = p * 4; o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = alpha[p]; }
    return sharp(o, { raw: { width: W, height: H, channels: 4 } }).png().toFile(out);
  };

  await buildPng([255, 255, 255], OUT_WHITE);
  await buildPng(RED, OUT_RED);
  const px = alpha.reduce((a, v) => a + (v > 20 ? 1 : 0), 0);
  console.log(`OK – ${px} linje-piksler. Skrev:\n  ${OUT_WHITE}\n  ${OUT_RED}`);
})().catch((e) => { console.error(e); process.exit(1); });
