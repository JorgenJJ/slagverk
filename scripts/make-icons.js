// Lager PWA-app-ikoner: hvit Randaberg-krest sentrert på et HELT RØDT kvadrat
// (rødt helt ut til kanten – ingen hvite kanter). Krest holdes innenfor ~80 %
// (safe-zone) så «maskable»-utklipp ikke kapper den.
// Kjør:  node scripts/make-icons.js
const sharp = require("sharp");
const path = require("path");

const WHITE = path.join(__dirname, "..", "public", "randaberg-logo-white.png");
const RED = "#b11116"; // samme som theme_color i manifestet
const out = (name) => path.join(__dirname, "..", "public", name);

async function make(size, file) {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const crest = await sharp(WHITE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: RED } })
    .composite([{ input: crest, top: pad, left: pad }])
    .png().toFile(file);
  console.log("wrote", file, `${size}x${size}`);
}

Promise.all([make(192, out("icon-192.png")), make(512, out("icon-512.png"))])
  .catch((e) => { console.error(e); process.exit(1); });
