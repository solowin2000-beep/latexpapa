import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.latexpapa.com';
const OUT = path.resolve('outputs/site');
const IMG_DIR = path.resolve('work/images/_all');
// CLEAN_OUTPUT — always build from scratch so renamed/removed pages do not linger
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const products = JSON.parse(fs.readFileSync('site/data/products.json', 'utf8'));
const categories = JSON.parse(fs.readFileSync('site/data/categories.json', 'utf8'));
// TOTAL — static catalogue size. Pieces added through /admin/ are added on top at runtime.
const TOTAL = products.length;

const BRAND = 'LatexPapa';
const LEGAL = 'LATEXPAPA';
const EMAIL = 'latexpapa@latexpapa.com';
const WHATSAPP = '+8615622227358';
const PRODUCTION = '2 weeks';
const SHIPPING = 'Free worldwide';

const e = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => '$' + Number(n).toFixed(2);
const byCat = Object.fromEntries(categories.map(c => [c.slug, products.filter(p => p.category === c.slug)]));
const catOf = Object.fromEntries(products.map(p => [p.id, categories.find(c => c.slug === p.category)]));

// LOCAL_IMG_ROOT — self-hosted product photos (converted from the original CDN backup)
const LOCAL_IMG_ROOT = path.resolve('work/images/webp');
const localImgs = new Set();
(function stageImages() {
  if (!fs.existsSync(LOCAL_IMG_ROOT)) return;
  for (const id of fs.readdirSync(LOCAL_IMG_ROOT)) {
    const dir = path.join(LOCAL_IMG_ROOT, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      localImgs.add(id + '/' + file);
      const dst = path.join(OUT, 'img', id, file);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(dir, file), dst);
    }
  }
  console.log('local product images staged:', localImgs.size);
})();

// HERO_IMG — optional homepage hero photo. Drop a file at site/assets/hero.(webp|jpg|png)
// and it is normalised to /img/hero.webp. When absent the hero shows a labelled placeholder.
const HERO_OUT = path.join(OUT, 'img', 'hero.webp');
const heroSrc = ['webp', 'jpg', 'jpeg', 'png']
  .map(ext => path.resolve('site/assets/hero.' + ext))
  .find(f => fs.existsSync(f));
if (heroSrc) {
  fs.mkdirSync(path.dirname(HERO_OUT), { recursive: true });
  if (path.extname(heroSrc).toLowerCase() === '.webp') {
    fs.copyFileSync(heroSrc, HERO_OUT);
  } else {
    const sharp = (await import('sharp')).default;
    await sharp(heroSrc).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 84 }).toFile(HERO_OUT);
  }
  console.log('hero image staged from', path.basename(heroSrc));
} else {
  console.log('hero image: none (placeholder shown)');
}

function imgSrc(p, idx) {
  const tail = p.images[idx];
  if (!tail) return null;
  const rel = `${p.id}/${String(idx + 1).padStart(2, '0')}.webp`;
  if (localImgs.has(rel)) return '/img/' + rel;
  return `https://d24naddg1rhy2p.cloudfront.net/283318/${tail}`;
}
const pic = (p, i = 0) => imgSrc(p, i);

const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = h => esc2(String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
// 搜索引擎大约只展示前 160 个字符。统一压到 158 以内，并在词边界收尾，避免出现半截句子。
function clampDesc(raw, max = 158) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (esc2(text).length <= max) return text;
  let cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.55) cut = cut.slice(0, sp);
  cut = cut.replace(/[\s,;:.!?\u2013\u2014-]+$/, '');
  while (esc2(cut + '\u2026').length > max && cut.length > 20) {
    cut = cut.slice(0, Math.max(20, cut.length - 2)).replace(/[\s,;:.!?\u2013\u2014-]+$/, '');
  }
  return cut + '\u2026';
}

/* ---------- shared chrome ---------- */
const NAV = [
  ['/latex-catsuits/', 'Catsuits'],
  ['/latex-hoods-masks/', 'Hoods & Masks'],
  ['/latex-dresses/', 'Dresses'],
  ['/latex-gloves/', 'Gloves'],
  ['/latex-stockings-socks/', 'Stockings'],
  ['/latex-accessories/', 'Accessories'],
  ['/shop/', 'All ' + TOTAL],
  ['/size-guide/', 'Size & Fit'],
];

function header(active) {
  const links = NAV.map(([h, t]) => {
    const label = h === '/shop/' ? 'All <span data-total>' + TOTAL + '</span>' : t;
    return `<a href="${h}"${h === active ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('');
  return `<div class="note"><b>${SHIPPING}</b> · Made to measure in ${PRODUCTION} · 100% natural latex · Questions? <a href="/contact/">Talk to us</a></div>
<header class="top"><div class="wrap">
  <a class="logo" href="/">Latex<span>Papa</span></a>
  <button class="navbtn" type="button" id="navbtn" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu"><span class="navbtn-box"><span></span><span></span><span></span></span></button>
  <nav class="nav" id="primary-nav" aria-label="Main">${links}<a class="nav-cta" href="/custom-latex/">Start a custom piece</a></nav>
  <a class="btn cta" href="/custom-latex/">Start a custom piece</a>
</div></header>`;
}

function footer() {
  return `<footer class="foot"><div class="wrap">
  <div class="cols">
    <div>
      <a class="logo" href="/">Latex<span>Papa</span></a>
      <p class="muted" style="max-width:30ch;margin-top:12px">Made-to-measure latex clothing, handmade in 0.25mm–1.00mm natural latex. Any colour, cut to your measurements, shipped worldwide.</p>
      <p class="muted" style="font-size:.86rem">${e(EMAIL)}<br>WhatsApp ${e(WHATSAPP)}</p>
    </div>
    <div><h4>Shop</h4><ul>${categories.map(c => `<li><a href="/${c.slug}/">${esc2(c.name)}</a></li>`).join('')}</ul></div>
    <div><h4>Help</h4><ul>
      <li><a href="/size-guide/">Size &amp; fit guide</a></li>
      <li><a href="/measure-guide/">How to measure</a></li>
      <li><a href="/size-calculator/">Size calculator</a></li>
      <li><a href="/shipping-returns/">Shipping &amp; returns</a></li>
      <li><a href="/faq/">FAQ</a></li>
      <li><a href="/track-order/">Track an order</a></li>
    </ul></div>
    <div><h4>Company</h4><ul>
      <li><a href="/about/">About ${BRAND}</a></li>
      <li><a href="/custom-latex/">Custom orders</a></li>
      <li><a href="/contact/">Contact</a></li>
      <li><a href="/latex-care/">Latex care</a></li>
      <li><a href="/wholesale/">Wholesale</a></li>
    </ul></div>
  </div>
  <div class="base"><span>© ${new Date().getFullYear()} ${LEGAL}. All rights reserved.</span><span>Prices in USD · Free worldwide shipping</span></div>
</div></footer>`;
}

const NAV_JS = `<script>
(function(){
  var btn = document.getElementById("navbtn"), nav = document.getElementById("primary-nav");
  if (!btn || !nav) return;
  function close(){
    nav.classList.remove("open"); btn.classList.remove("on");
    btn.setAttribute("aria-expanded","false"); btn.setAttribute("aria-label","Open menu");
  }
  function open(){
    nav.classList.add("open"); btn.classList.add("on");
    btn.setAttribute("aria-expanded","true"); btn.setAttribute("aria-label","Close menu");
  }
  btn.addEventListener("click", function(){ nav.classList.contains("open") ? close() : open(); });
  nav.addEventListener("click", function(ev){ if (ev.target.closest("a")) close(); });
  document.addEventListener("keydown", function(ev){ if (ev.key === "Escape") close(); });
  window.addEventListener("resize", function(){ if (window.innerWidth > 900) close(); });
  window.addEventListener("pageshow", close);
})();
</script>`;

// inline helper that surfaces products added through /admin/ on listing pages
const ADDITIONS_SRC = path.resolve('site/scripts/additions.js');
const ADDITIONS_JS = fs.existsSync(ADDITIONS_SRC)
  ? '<script>' + fs.readFileSync(ADDITIONS_SRC, 'utf8') + '</script>'
  : '';

function layout({ title, description, url, body, jsonLd = [], ogImage, robots, active }) {
  const metaDesc = clampDesc(description);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc2(title)}</title>
<meta name="description" content="${esc2(metaDesc)}">
<link rel="canonical" href="${SITE}${url}">
${robots ? `<meta name="robots" content="${esc2(robots)}">` : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<meta name="theme-color" content="#0a0a0b">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="google-site-verification" content="rxBc3hfz4up1QpJJtna_1b4ePpMZKHK3OiaBwbWU0sA">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc2(title)}">
<meta property="og:description" content="${esc2(metaDesc)}">
<meta property="og:url" content="${SITE}${url}">
${ogImage ? `<meta property="og:image" content="${ogImage}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${ogImage}">` : '<meta name="twitter:card" content="summary">'}
<link rel="stylesheet" href="/assets/style.css">
<link rel="alternate" hreflang="en" href="${SITE}${url}">
<link rel="alternate" hreflang="x-default" href="${SITE}${url}">
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
${header(active)}
<main>
${body}
</main>
${footer()}
${NAV_JS}
${ADDITIONS_JS}
</body>
</html>`;
}

/* ---------- structured data ---------- */
const ORG = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: LEGAL, alternateName: BRAND, url: SITE,
  email: EMAIL, telephone: WHATSAPP,
  address: { '@type': 'PostalAddress', addressLocality: 'Hong Kong', addressCountry: 'HK' },
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: EMAIL, telephone: WHATSAPP, availableLanguage: ['en'] }],
};
const WEBSITE = { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE, publisher: { '@type': 'Organization', name: LEGAL } };

const crumbs = list => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: list.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: SITE + x.url })),
});

function productLd(p, c) {
  return {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, sku: p.id.toUpperCase(), url: `${SITE}/product/${p.slug}/`,
    image: p.images.slice(0, 6).map(t => `https://d24naddg1rhy2p.cloudfront.net/283318/${t}`),
    description: plain(p.metaDescription || p.descriptionHtml).slice(0, 900),
    category: c ? c.name : undefined,
    brand: { '@type': 'Brand', name: BRAND },
    material: '100% natural latex',
    itemCondition: 'https://schema.org/NewCondition',
    offers: {
      '@type': 'Offer', url: `${SITE}/product/${p.slug}/`, priceCurrency: 'USD',
      price: p.price ? p.price.toFixed(2) : undefined,
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: LEGAL },
      shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'USD' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' } },
      hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'US', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' },
    },
  };
}

/* ---------- components ---------- */
function card(p) {
  const c = catOf[p.id];
  const src = pic(p, 0);
  return `<a class="card" href="/product/${p.slug}/">
  <div class="ph${src ? '' : ' empty'}"${src ? '' : ` data-label="${esc2(p.name.slice(0, 40))}"`}>
    ${src ? `<img src="${src}" alt="${esc2(p.name)} — handmade latex, made to measure" loading="lazy" width="600" height="600">` : ''}
    ${p.wasPrice ? `<span class="badge">Save ${money(p.wasPrice - p.price).replace('.00', '')}</span>` : ''}
  </div>
  <div class="in">
    <span class="cat">${esc2(c.name)}</span>
    <span class="nm">${esc2(p.name)}</span>
    <span class="pr">${p.price ? money(p.price) : 'On request'}${p.wasPrice ? `<span class="was">${money(p.wasPrice)}</span>` : ''}</span>
  </div>
</a>`;
}

function grid(list, cols = 4) {
  return `<div class="grid g${cols}">${list.map(card).join('')}</div>`;
}

function related(p, n = 4) {
  const pool = products.filter(x => x.category === p.category && x.id !== p.id);
  const out = pool.slice(0, n);
  while (out.length < n) { const x = products[(products.indexOf(p) + out.length + 1) % products.length]; if (!out.includes(x) && x.id !== p.id) out.push(x); else break; }
  return out;
}


const LP_CHIP_JS = `<script>
document.querySelectorAll(".opt .chips").forEach(function(g){
  g.addEventListener("click", function(e){
    var b = e.target.closest(".chip"); if(!b) return;
    g.querySelectorAll(".chip").forEach(function(c){ c.classList.remove("on") });
    b.classList.add("on");
  });
});
document.querySelectorAll(".thumbs").forEach(function(g){
  g.addEventListener("click", function(e){
    var t = e.target.closest(".thumb"); if(!t) return;
    g.querySelectorAll(".thumb").forEach(function(c){ c.classList.remove("on") });
    t.classList.add("on");
    var hero = document.getElementById("hero");
    if(hero){ hero.src = t.getAttribute("data-full"); }
  });
});
</script>`;

/* ---------- pages ---------- */
const pages = [];
const add = (url, html) => pages.push({ url, html });

function writePage(url, html) {
  const rel = url === '/' ? 'index.html' : path.join(url.replace(/^\//, '').replace(/\/$/, ''), 'index.html');
  const abs = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html, 'utf8');
  add(url, html);
}

// HOME
const featured = ['lp-058', 'lp-071', 'lp-003', 'lp-053'].map(id => products.find(p => p.id === id)).filter(Boolean);
writePage('/', layout({
  title: 'Made-to-Measure Latex Clothing | LatexPapa',
  description: 'Handmade latex clothing cut to your measurements. Catsuits, dresses, hoods and gloves in 0.25–1.00mm natural latex. Free worldwide shipping, made in 2 weeks.',
  url: '/', active: null,
  jsonLd: [ORG, WEBSITE, {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Featured latex clothing',
    itemListElement: featured.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/product/${p.slug}/`, name: p.name })),
  }],
  body: `<section class="hero"><div class="wrap">
    <div>
      <p class="eyebrow">Handmade to your measurements</p>
      <h1>Latex clothing that fits <em>you</em>, not a size chart.</h1>
      <p class="lead">Every piece is cut from 100% natural latex sheet to the measurements you send us. Choose your colour, thickness and hardware — we hand-build it in ${PRODUCTION} and ship it free, worldwide.</p>
      <div class="hero-actions">
        <a class="btn" href="/shop/">Shop all <span data-total>${TOTAL}</span> pieces</a>
        <a class="btn ghost" href="/measure-guide/">How to measure yourself</a>
      </div>
      <div class="trust">
        <div><b data-total>${TOTAL}</b>pieces, all made to measure</div>
        <div><b>0.25–1.00mm</b>natural latex sheeting</div>
        <div><b>Free</b>worldwide shipping</div>
        <div><b>${PRODUCTION}</b>production time</div>
      </div>
    </div>
    <div class="hero-art">
      <img src="/img/hero.webp" alt="Made-to-measure latex clothing by LatexPapa" width="1024" height="1280" fetchpriority="high" onload="this.closest('.hero-art').classList.add('hasimg')" onerror="this.remove()">
      <span class="hero-ph">Product photography</span>
    </div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Why it fits</p><h2>No two bodies are the same size L</h2></div>
    <p>Latex has no woven threads, so it only hugs the body while it is stretched — which is why makers cut from finished measurements rather than letters. Send us nine numbers and we cut a pattern that is genuinely yours.</p></div>
    <div class="tiles">
      <div class="tile"><h3>Measure once, properly</h3><p>Nine measurements, three of which almost everyone gets wrong. Our guide walks through each one with the correct tape position.</p><a class="btn ghost" href="/measure-guide/" style="margin-top:16px">Measure guide</a></div>
      <div class="tile"><h3>Check the maths</h3><p>Free size calculator: enter your body measurements and sheeting thickness, get the finished measurements your garment should be cut to.</p><a class="btn ghost" href="/size-calculator/" style="margin-top:16px">Size calculator</a></div>
      <div class="tile"><h3>Pick your thickness</h3><p>0.25mm to 1.00mm changes stretch, shine, durability and how the pattern is reduced. Here is how each sheet behaves.</p><a class="btn ghost" href="/thickness-guide/" style="margin-top:16px">Thickness guide</a></div>
    </div>
  </div></section>

  <section style="background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Shop by category</p><h2>Find your piece</h2></div><a class="btn ghost" href="/shop/">View everything</a></div>
    <div class="grid g3">${categories.map(c => {
      const list = byCat[c.slug]; const hero = list.find(p => pic(p, 0)); const s = hero ? pic(hero, 0) : null;
      return `<a class="card" href="/${c.slug}/"><div class="ph${s ? '' : ' empty'}"${s ? '' : ` data-label="${esc2(c.name)}"`}>${s ? `<img src="${s}" alt="${esc2(c.name)} — handmade to measure" loading="lazy" width="600" height="600">` : ''}</div><div class="in"><span class="nm">${esc2(c.name)}</span><span class="cat">${list.length} pieces</span></div></a>`;
    }).join('')}</div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Most requested</p><h2>Bestsellers</h2></div></div>
    ${grid(featured, 4)}
  </div></section>

  <section style="background:var(--bg2);border-top:1px solid var(--line)"><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">How it works</p><h2>From measurement tape to your door</h2></div></div>
    <div class="tiles">
      <div class="tile"><h3>1 · Pick the piece</h3><p>Choose a style, then pick your colour from the full latex range. Colours outside the standard list cost +20%.</p></div>
      <div class="tile"><h3>2 · Send measurements</h3><p>We email a measurement sheet with your order. If you are unsure, the calculator gives you the finished numbers to send.</p></div>
      <div class="tile"><h3>3 · We hand-build it</h3><p>Gluing, seaming and finishing take ${PRODUCTION}. We photograph the piece before it ships.</p></div>
      <div class="tile"><h3>4 · Free tracked shipping</h3><p>USA 7 business days, Europe 10, Japan &amp; Korea 7, rest of world 10–15. Plain, unmarked packaging.</p></div>
    </div>
  </div></section>

  <section><div class="wrap"><div class="sec-head"><div><p class="eyebrow">Questions</p><h2>Before you order</h2></div><a class="btn ghost" href="/faq/">All questions</a></div>
    <div class="faq">
      <details><summary>What if my measurements are wrong?</summary><div class="ans">Send us your numbers and we will sanity-check them before cutting. If a garment is built outside the measurements you supplied, we remake it.</div></details>
      <details><summary>Can you copy a colour I have seen?</summary><div class="ans">Yes. We make every piece to order, so we can match almost any colour in the latex range, and metallic finishes are available for a 20% surcharge.</div></details>
      <details><summary>How long does it take?</summary><div class="ans">Production is ${PRODUCTION} from measurement confirmation, then shipping on top. Total to the USA is around 4 weeks door to door.</div></details>
      <details><summary>Do you accept returns?</summary><div class="ans">Because every piece is cut to your specific measurements, we do not accept returns or exchanges. If something arrives defective, tell us within 48 hours and we will remake it or refund the defective part.</div></details>
    </div>
  </div></section>`,
}));

// CATEGORY
for (const c of categories) {
  const list = byCat[c.slug];
  const hero = list.find(p => pic(p, 0));
  writePage(`/${c.slug}/`, layout({
    title: `${c.title} — Made to Measure | ${BRAND}`,
    description: c.desc,
    url: `/${c.slug}/`, active: `/${c.slug}/`,
    ogImage: hero ? pic(hero, 0) : undefined,
    jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: c.name, url: `/${c.slug}/` }]), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: c.title,
      numberOfItems: list.length,
      itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/product/${p.slug}/`, name: p.name })),
    }],
    body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>${esc2(c.name)}</nav></div>
    <section class="tight"><div class="wrap">
      <p class="eyebrow">${list.length} pieces · made to measure</p>
      <h1>${esc2(c.title)}</h1>
      <p class="lead">${esc2(c.desc)}</p>
      <div class="trust" style="border-top:1px solid var(--line);margin-top:30px">
        <div><b>${PRODUCTION}</b>production</div><div><b>Free</b>worldwide shipping</div>
        <div><b>100%</b>natural latex</div><div><b>Any</b>colour</div>
      </div>
    </div></section>
    <section><div class="wrap">${grid(list, 4)}</div></section>`,
  }));
}

// SHOP
writePage('/shop/', layout({
  title: `All Latex Clothing — ${TOTAL} Made-to-Measure Pieces | ${BRAND}`,
  description: 'Every LatexPapa piece: catsuits, dresses, hoods, masks, gloves, stockings, skirts and accessories — all handmade to your measurements in natural latex.',
  url: '/shop/', active: '/shop/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Shop', url: '/shop/' }]), {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'All LatexPapa products', numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/product/${p.slug}/`, name: p.name })),
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Shop</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow"><span data-total>${TOTAL}</span> pieces · all made to measure</p>
    <h1>Everything we make</h1>
    <p class="lead">Every item is cut from 100% natural latex sheeting to the measurements you send us. Pick a piece, choose a colour, and we build it in ${PRODUCTION}.</p>
  </div></section>
  ${categories.map(c => `<section class="tight"><div class="wrap"><div class="sec-head"><h2 style="margin:0">${esc2(c.name)}</h2><a class="btn ghost" href="/${c.slug}/">See category</a></div>${grid(byCat[c.slug], 4)}</div></section>`).join('')}`,
}));

// PRODUCT
for (const p of products) {
  const c = catOf[p.id];
  const main = pic(p, 0);
  const other = p.wasPrice && p.price ? `<span class="w">${money(p.wasPrice)}</span><span class="save">Save ${money(p.wasPrice - p.price)}</span>` : '';
  const sizes = p.options.Size || [];
  const colors = p.options.Color || [];
  const styles = p.options.Style || [];
  const descPlain = plain(p.metaDescription);
  const faqItems = [
    { q: `How is the ${p.name.toLowerCase()} sized?`, a: 'It is not sized from a chart — we cut the pattern to the measurements you send after ordering. XS–XXL are starting points; Customisation means you send full measurements.' },
    { q: 'How long does production take?', a: `Production is ${PRODUCTION} from the moment we confirm your measurements, then shipping on top. USA 7 business days, Europe 10, Japan and Korea 7, elsewhere 10–15.` },
    { q: 'Can I choose a colour?', a: 'Yes. Every piece is made to order so we can build it in almost any colour in the latex range. Metallic colours add 20%.' },
    { q: 'What is it made of?', a: '100% natural latex sheeting. Standard is 0.40mm; anything from 0.25mm to 1.00mm is available on request.' },
    { q: 'Can I return it?', a: 'Because it is cut to your measurements, we cannot accept returns or exchanges. If it arrives defective, contact us within 48 hours for a remake or partial refund.' },
  ];
  writePage(`/product/${p.slug}/`, layout({
    title: `${p.name} — Made to Measure | ${BRAND}`,
    description: (() => {
      const suffix = p.price ? ` From ${money(p.price)}.` : '';
      const base = descPlain || `${p.name}, handmade to your measurements in 100% natural latex.`;
      return clampDesc(base, 158 - suffix.length) + suffix;
    })(),
    url: `/product/${p.slug}/`, active: `/${p.category}/`,
    ogImage: main, robots: p.price ? undefined : 'noindex,follow',
    jsonLd: [
      ORG, productLd(p, c),
      crumbs([{ name: 'Home', url: '/' }, { name: c.name, url: `/${c.slug}/` }, { name: p.name, url: `/product/${p.slug}/` }]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
    body: `<div class="wrap">
    <nav class="crumbs"><a href="/">Home</a><span>/</span><a href="/${c.slug}/">${esc2(c.name)}</a><span>/</span>${esc2(p.name)}</nav>
    <div class="pdp">
      <div class="gallery">
        <div class="main"${main ? '' : ' data-label="Photos coming soon" style="display:grid;place-items:center;color:var(--muted2);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase"'}>${main ? `<img id="hero" src="${main}" alt="${esc2(p.name)} in natural latex, made to measure" width="1000" height="1000">` : 'Photos coming soon'}</div>
        ${p.images.length > 1 ? `<div class="thumbs">${p.images.slice(0, 5).map((t, i) => { const s = pic(p, i); return `<img src="${s}" alt="${esc2(p.name)} view ${i + 1}" data-full="${s}" class="thumb${i === 0 ? ' on' : ''}" loading="lazy" width="200" height="200">`; }).join('')}</div>` : ''}
      </div>
      <div>
        <p class="eyebrow">${esc2(c.name)}</p>
        <h1>${esc2(p.name)}</h1>
        <div class="pricebox">
          <span class="p">${p.price ? money(p.price) : 'Price on request'}</span>${other}
        </div>
        <p class="lead" style="font-size:1rem">${descPlain ? esc2(descPlain.slice(0, 260)) : 'Handmade to your measurements in 100% natural latex.'}</p>
        ${sizes.length ? `<div class="opt"><div class="lab">Size</div><div class="chips">${sizes.map((s, i) => `<button class="chip${p.defaults.Size === s ? ' on' : ''}" type="button">${esc2(s)}</button>`).join('')}</div></div>` : ''}
        ${colors.length ? `<div class="opt"><div class="lab">Colour <span class="muted" style="text-transform:none;letter-spacing:0">— any colour available, metallic +20%</span></div><div class="chips">${colors.map(s => `<button class="chip${p.defaults.Color === s ? ' on' : ''}" type="button">${esc2(s)}</button>`).join('')}</div></div>` : ''}
        ${styles.length ? `<div class="opt"><div class="lab">Style</div><div class="chips">${styles.map(s => `<button class="chip${p.defaults.Style === s ? ' on' : ''}" type="button">${esc2(s)}</button>`).join('')}</div></div>` : ''}
        <div class="panel" style="margin:22px 0">
          <a class="btn block" href="/contact/?item=${encodeURIComponent(p.name)}">Order this piece</a>
          <p class="muted" style="font-size:.82rem;margin:12px 0 0;text-align:center">Card, Apple Pay, Google Pay and PayPal · Free worldwide shipping</p>
        </div>
        <ul class="bullets">
          <li>Cut to your measurements — send them after ordering</li>
          <li>100% natural latex, 0.40mm standard, 0.25mm–1.00mm on request</li>
          <li>Choose colour, zipper placement, collar and hardware</li>
          <li>Handmade in ${PRODUCTION}, then free tracked shipping</li>
          <li>Plain, unmarked packaging</li>
          <li>Defective items remade or refunded within 48 hours of delivery</li>
        </ul>
        <div class="panel">
          <h3 style="margin-bottom:14px">Specification</h3>
          <dl class="spec">
            <dt>Material</dt><dd>100% natural latex sheeting</dd>
            <dt>Thickness</dt><dd>0.40mm standard · 0.25mm–1.00mm available</dd>
            <dt>Colour</dt><dd>Any colour in the latex range · metallic +20%</dd>
            <dt>Made to</dt><dd>Your supplied measurements</dd>
            <dt>Production</dt><dd>${PRODUCTION} after measurement confirmation</dd>
            <dt>Shipping</dt><dd>Free worldwide · USA 7 days, EU 10, JP/KR 7, other 10–15</dd>
            <dt>SKU</dt><dd>${p.id.toUpperCase()}</dd>
          </dl>
        </div>
      </div>
    </div>

    <section class="tight"><div class="prose">
      <h2>About this piece</h2>
      ${p.descriptionHtml || '<p>Handmade to your measurements in 100% natural latex.</p>'}
      <h2>How measuring works</h2>
      <p>Nothing is cut until we have your numbers. After you order we send a measurement sheet — nine values for a full body piece, fewer for gloves, hoods and stockings. If you would rather check the maths yourself, our <a href="/size-calculator/">latex size calculator</a> returns the finished measurements your garment should be cut to at each sheet thickness, and the <a href="/measure-guide/">measuring guide</a> shows where the tape goes.</p>
      <h2>Latex sizing is not like fabric sizing</h2>
      <p>Natural latex has no woven threads to hold a shape, so a garment only hugs the body while it is stretched. Makers therefore cut the pattern <em>below</em> your body measurements — typically 12–15% reduction at 0.40mm — which is why a latex garment arrives measuring smaller than you are, and why two makers disagree about what "L" means. It is also why we ask for numbers rather than a letter size.</p>
      <h2>Care</h2>
      <p>Rinse after wearing, wash in lukewarm water with mild soap, dry in the shade, and store with a little talc in a cool dark place. Polished latex can be treated with silicone shiner. Avoid oil-based products, and keep it away from copper, brass and sunlight.</p>
    </div></section>

    <div class="faq" style="margin-bottom:64px">
      ${faqItems.map(f => `<details><summary>${esc2(f.q)}</summary><div class="ans">${esc2(f.a)}</div></details>`).join('')}
    </div>

    <section class="tight"><div class="sec-head"><h2 style="margin:0">More ${esc2(c.name.toLowerCase())}</h2><a class="btn ghost" href="/${c.slug}/">All ${esc2(c.name)}</a></div>${grid(related(p, 4), 4)}</div></section>
    </div>
    ${LP_CHIP_JS}`,
  }));
}

console.log('pages so far:', pages.length);
fs.writeFileSync(path.resolve('work/.build-state.json'), JSON.stringify({ count: pages.length }), 'utf8');

/* ---------- content pages ---------- */
const HALF = months => months;

// SIZE GUIDE
writePage('/size-guide/', layout({
  title: `Latex Size Guide — Why Size Letters Do Not Work | ${BRAND}`,
  description: 'Latex has no sizing standard: makers cut from body measurements, not size letters. The charts, the nine measurements we need, and how thickness changes fit.',
  url: '/size-guide/', active: '/size-guide/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Size & fit', url: '/size-guide/' }]), {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'Should I order a size letter or send measurements?', acceptedAnswer: { '@type': 'Answer', text: 'Send measurements. Latex has no universal sizing standard, so a size letter means something different at every maker. The XS–XXL options on our product pages are starting points; Customisation means you send full measurements.' } },
      { '@type': 'Question', name: 'What happens if the measurements are wrong?', acceptedAnswer: { '@type': 'Answer', text: 'We sanity-check every measurement sheet before cutting and will come back to you if a number looks inconsistent. If we build outside the measurements you supplied, we remake the garment.' } },
      { '@type': 'Question', name: 'Does thickness change my size?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The pattern is reduced less as the sheet gets thicker: roughly 14–17% at 0.25mm down to 6–9% at 1.00mm. The same body produces different finished garment measurements at different thicknesses.' } },
    ],
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Size &amp; fit</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Size &amp; fit</p>
    <h1>There is no such thing as a latex size L</h1>
    <p class="lead">Natural latex has no woven threads to hold a shape, so a garment only hugs the body while it is stretched. Every maker therefore cuts the pattern below your body measurements — and every maker reduces by a different amount. That is why we ask for numbers instead of a letter.</p>
  </div></section>

  <section class="tight"><div class="wrap">
    <div class="tiles">
      <div class="tile"><h3>Step 1 — measure</h3><p>Nine values for a full-body piece. Our <a href="/measure-guide/">measuring guide</a> shows where the tape goes, including the three measurements almost everyone gets wrong.</p></div>
      <div class="tile"><h3>Step 2 — check the maths</h3><p>The <a href="/size-calculator/">size calculator</a> applies the reduction for your sheet thickness and returns the finished measurements to cut.</p></div>
      <div class="tile"><h3>Step 3 — send the sheet</h3><p>We email a measurement sheet with your order. Paste your numbers in and reply. Nothing is cut until we have them.</p></div>
    </div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">Reference</p><h2>Size chart</h2></div><p>Charts are a starting point for the XS–XXL options. If two of your measurements sit in different columns, order Customisation and send your numbers — that is the normal case, not the exception.</p></div>
    <div class="grid g2">
      ${[
        ["women","Women’s clothing size chart","XXS–8XL in cm and inches: height, neck, chest, waist, hip, torso length, arm and leg measurements."],
        ["men","Men’s clothing size chart","XXS–8XL in cm and inches — the same measurement set drafted for a male frame."],
        ["gloves","Glove size chart","Wrist, palm, bicep, top-of-middle-finger-to-wrist and total length, in Small, Medium and Large."],
        ["mask","Hood and mask size chart","Head vertical circumference, head horizontal circumference and neck circumference, XS to XXL."],
        ["socks","Stocking and sock size chart","Calf, ankle, length and foot size from XS to 4XL, with UK and EU shoe equivalents."]
      ].map(([k,t,d]) => `<figure class="panel" style="margin:0"><img src="/img/size-charts/${k}.webp" alt="${t}" loading="lazy" width="1600" height="900" style="border-radius:9px;border:1px solid var(--line)"><figcaption style="margin-top:14px"><strong style="color:var(--ink)">${t}</strong><span class="muted" style="display:block;font-size:.88rem;margin-top:4px">${d}</span></figcaption></figure>`).join('')}
    </div>
  </div></section>

  <section style="background:var(--bg2);border-top:1px solid var(--line)"><div class="wrap">
    <div class="prose">
      <h2>How the reduction works</h2>
      <p>A latex garment arrives measuring smaller than your body. That is correct, not a mistake. The pattern is cut below your measurements so the sheet is already under tension when you put it on — that tension is the entire reason latex clings.</p>
      <p>The amount of reduction depends mainly on the thickness of the sheet:</p>
      <ul>
        <li><strong>0.25 mm</strong> — reduced 14–17%</li>
        <li><strong>0.40 mm</strong> — reduced 12–15% (our standard)</li>
        <li><strong>0.60 mm</strong> — reduced 10–13%</li>
        <li><strong>0.80 mm</strong> — reduced 8–11%</li>
        <li><strong>1.00 mm</strong> — reduced 6–9%</li>
      </ul>
      <p>Thicker sheeting stretches less, so it must be cut closer to your actual measurements. That is why the same person needs a different finished catsuit in 0.25 mm and in 1.00 mm.</p>
      <h2>Sizes we list</h2>
      <dl class="spec" style="margin-top:14px">
        <dt>XS – XXL</dt><dd>A standard starting block. Order this only if your measurements sit comfortably inside one column.</dd>
        <dt>One-size</dt><dd>Used for hoods, chokers and some accessories. Still made to your measurements where the piece is fitted.</dd>
        <dt>Customisation</dt><dd>You send full measurements after ordering. This is the option most customers choose, and it costs no more.</dd>
      </dl>
    </div>
  </div></section>

  <section><div class="wrap"><div class="sec-head"><div><p class="eyebrow">Questions</p><h2>Size &amp; fit FAQ</h2></div><a class="btn ghost" href="/faq/">All questions</a></div>
    <div class="faq">
      <details><summary>Should I order a size letter or send measurements?</summary><div class="ans">Send measurements. Latex has no universal sizing standard, so a size letter means something different at every maker. The XS–XXL options on our product pages are starting points; Customisation means you send full measurements.</div></details>
      <details><summary>What happens if the measurements are wrong?</summary><div class="ans">We sanity-check every measurement sheet before cutting and will come back to you if a number looks inconsistent. If we build outside the measurements you supplied, we remake the garment.</div></details>
      <details><summary>Does thickness change my size?</summary><div class="ans">Yes. The pattern is reduced less as the sheet gets thicker: roughly 14–17% at 0.25mm down to 6–9% at 1.00mm. The same body produces different finished garment measurements at different thicknesses.</div></details>
      <details><summary>Can you make a piece without a size at all?</summary><div class="ans">Yes — that is what most of our orders are. Choose Customisation and send your measurements; we draft the pattern from them.</div></details>
    </div>
  </div></section>`,
}));

// MEASURE GUIDE
const NINE = [
  ['Chest', 'Around the fullest part of the bust or chest. Tape level and snug, but not compressing. Keep your arms down.'],
  ['Underbust', 'Directly under the bust, around the ribcage, tape level. This tells us how much support the garment needs.'],
  ['Waist', 'The narrowest point of the torso, usually just above the navel. Breathe out normally — do not pull the stomach in.'],
  ['Hip', 'Around the fullest part of the hips and seat, roughly 20 cm below the waist. Keep your feet together.'],
  ['Thigh', 'The widest point of the upper thigh, immediately below the crotch. Measure both legs and send the larger number.'],
  ['Upper arm', 'Relax your arm at your side and measure around the widest part, normally near the bicep.'],
  ['Neck', 'Around the base of the neck. Add nothing — a latex collar should sit snug without pressing.'],
  ['Torso length', 'Hold the tape at the side of your neck, level with the top of the shoulder, and let it fall straight down your front to the point between your legs where the catsuit seam would sit. Do not follow the curve of the body.'],
  ['Height', 'Optional but useful for sleeve and leg length. Measure without shoes, standing against a wall.'],
];
writePage('/measure-guide/', layout({
  title: `How to Measure for Latex Clothing — The Nine Measurements | ${BRAND}`,
  description: 'Latex makers work from nine body measurements, not size letters. Where the tape goes, the three most people get wrong, and what to do with the numbers.',
  url: '/measure-guide/', active: '/size-guide/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Measuring guide', url: '/measure-guide/' }]), {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'Can I measure myself for latex clothing?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, and most makers expect it. Self-measurement is usually accurate to within 1–2 cm, which the reduction absorbs. Measure twice, keep the tape level, and never pull it tight enough to compress the skin.' } },
      { '@type': 'Question', name: 'Which measurement do people get wrong most often?', acceptedAnswer: { '@type': 'Answer', text: 'Torso length, followed by the thigh. Torso length is usually measured along the curve of the body instead of straight down, which shortens it. Thigh is often measured too low, where the leg has already narrowed.' } },
      { '@type': 'Question', name: 'Should I measure over clothing?', acceptedAnswer: { '@type': 'Answer', text: 'No. Measure against bare skin or over the underwear you would wear under the garment, and always with the same tape.' } },
    ],
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Measuring guide</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Measuring guide</p>
    <h1>Nine measurements, not a size letter</h1>
    <p class="lead">Get these right once and you can order from any latex maker without arguing about what a size "L" means. Most of the work is in three numbers that almost everybody takes wrong.</p>
  </div></section>

  <section class="tight"><div class="wrap">
    <div class="tiles">
      <div class="tile"><h3>Tape</h3><p>Use a soft tailor's tape, not a builder's tape and not a piece of string. String stretches and lies.</p></div>
      <div class="tile"><h3>Clothing</h3><p>Wear as little as possible — thin underwear at most. Clothes add a centimetre or more in the wrong places.</p></div>
      <div class="tile"><h3>Tension</h3><p>Stand relaxed and breathe normally. Never pull the tape tight enough to dent the skin.</p></div>
      <div class="tile"><h3>Units</h3><p>Write everything in centimetres. If a measurement sits near a boundary, take it again.</p></div>
    </div>
  </div></section>

  <section><div class="wrap"><div class="sec-head"><div><p class="eyebrow">Step by step</p><h2>The nine measurements</h2></div></div>
    <div class="panel"><dl class="spec">${NINE.map(([k, v], i) => `<dt>${i + 1}. ${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
  </div></section>

  <section style="background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
    <div class="sec-head"><div><p class="eyebrow">The usual mistakes</p><h2>Three measurements people get wrong</h2></div></div>
    <div class="tiles">
      <div class="tile"><h3>Torso length</h3><p>The classic mistake. It has to run <strong>straight</strong> down from the side of the neck, passing over the bust, to the crotch point. If you follow the curve of your body the number comes out short — and a catsuit that is short in the torso cannot be corrected later.</p></div>
      <div class="tile"><h3>Thigh</h3><p>Usually taken too low, where the leg has already narrowed. It should be at the widest point, immediately below the crotch. Measure both legs and send the larger.</p></div>
      <div class="tile"><h3>Upper arm</h3><p>Often measured flexed, or with the arm pressed against the chest. Keep the arm hanging relaxed at your side and measure the widest part.</p></div>
    </div>
  </div></section>

  <section><div class="wrap"><div class="prose">
    <h2>What to do with the numbers</h2>
    <p>Put them into the <a href="/size-calculator/">latex size calculator</a>. It applies the reduction for your sheeting thickness and produces a measurement sheet showing both your body measurements and the finished sizes to cut — which is exactly what a maker needs. Then paste that sheet into your order notes, or reply to the order confirmation email with it.</p>
    <div class="faq" style="margin-top:34px">
      <details><summary>Can I measure myself for latex clothing?</summary><div class="ans">Yes, and most makers expect it. Self-measurement is usually accurate to within 1–2 cm, which the reduction absorbs. Measure twice, keep the tape level, and never pull it tight enough to compress the skin.</div></details>
      <details><summary>Which measurement do people get wrong most often?</summary><div class="ans">Torso length, followed by the thigh. Torso length is usually measured along the curve of the body instead of straight down, which shortens it. Thigh is often measured too low, where the leg has already narrowed.</div></details>
      <details><summary>Why have I been asked for a measurement I have never heard of?</summary><div class="ans">Because latex patterns are drafted from body measurements rather than from a size letter. Torso length, upper arm and thigh are normal in this trade but almost never appear in high-street sizing.</div></details>
      <details><summary>Should I measure over clothing?</summary><div class="ans">No. Measure against bare skin or over the underwear you would wear under the garment, and always with the same tape.</div></details>
    </div>
  </div></section>`,
}));

// SIZE CALCULATOR
const CALC_JS = `<script>
(function(){
  var MODEL={parts:[
    {id:"chest",label:"Chest / bust",note:"Widest point"},
    {id:"underbust",label:"Underbust",note:"Optional for tops and dresses"},
    {id:"waist",label:"Waist",note:"Narrowest point"},
    {id:"hip",label:"Hip",note:"Widest point"},
    {id:"thigh",label:"Thigh",note:"Upper thigh, widest"},
    {id:"upperArm",label:"Upper arm",note:"Relaxed arm, widest"},
    {id:"neck",label:"Neck",note:"Base of the neck"},
    {id:"torsoLength",label:"Torso length",note:"Side of neck to crotch",length:true}],
    ease:{"0.25":[14,17],"0.40":[12,15],"0.60":[10,13],"0.80":[8,11],"1.00":[6,9]},
    offset:{chest:0,underbust:-1,waist:1,hip:0,thigh:2,upperArm:2,neck:-5},
    lengthEase:[2,4],tension:{relaxed:-2,standard:0,snug:2}};
  var unit="cm";
  var r1=function(n){return Math.round(n*10)/10};
  var r0=function(n){return Math.round(n)};
  var toIn=function(cm){return r1(cm/2.54)};
  var toCm=function(v){return unit==="cm"?v:r1(v*2.54)};
  function val(id){var el=document.getElementById(id);var v=el?parseFloat(el.value):NaN;if(!isFinite(v)||v<=0)return null;return toCm(v)}
  function easeRange(part,th,tension){var t=MODEL.tension[tension]||0,lo,hi;
    if(part.length){lo=MODEL.lengthEase[0];hi=MODEL.lengthEase[1]}
    else{var e=MODEL.ease[th];var off=MODEL.offset[part.id]||0;lo=e[0]+off;hi=e[1]+off}
    return [lo+t,hi+t]}
  function finished(part,body,th,tension){var r=easeRange(part,th,tension);
    return {lo:r[0],hi:r[1],smallest:r1(body*(1-r[1]/100)),largest:r1(body*(1-r[0]/100))}}
  function uT(a,b){return unit==="cm"?r1(a)+" – "+r1(b)+" cm":toIn(a)+" – "+toIn(b)+" in"}
  function uT2(a,b){return unit==="cm"?toIn(a)+" – "+toIn(b)+" in":r1(a)+" – "+r1(b)+" cm"}
  function vT(cm){return unit==="cm"?r1(cm)+" cm":toIn(cm)+" in"}
  function vT2(cm){return unit==="cm"?toIn(cm)+" in":r1(cm)+" cm"}
  function applyUnit(next){
    if(next===unit)return;
    var ins=document.querySelectorAll(".unit-input");
    Array.prototype.forEach.call(ins,function(el){var v=parseFloat(el.value);
      if(isFinite(v)&&v>0)el.value=next==="in"?toIn(v):toCm(v);
      el.placeholder=next;el.step=next==="in"?"0.25":"0.5"});
    unit=next;
    Array.prototype.forEach.call(document.querySelectorAll(".seg"),function(b){
      b.classList.toggle("is-active",b.getAttribute("data-unit")===next)});
    run();
  }
  Array.prototype.forEach.call(document.querySelectorAll(".seg"),function(b){
    b.addEventListener("click",function(){applyUnit(b.getAttribute("data-unit"))})});
  function run(){
    var th=document.getElementById("thickness").value;
    var tension=document.getElementById("fit").value;
    var exp=document.getElementById("exp").value;
    var who=document.getElementById("who").value;
    var garment=document.getElementById("garment").selectedOptions[0].text;
    var matLabel=document.getElementById("thickness").selectedOptions[0].text;
    var rows=[],sheet=[];
    MODEL.parts.forEach(function(p){
      var body=val(p.id);if(!body)return;
      var f=finished(p,body,th,tension);
      var pick=(f.smallest+f.largest)/2;
      if(exp==="first")pick=f.largest;
      if(exp==="pro")pick=f.smallest;
      rows.push({p:p,body:body,f:f,pick:r1(pick)});
      sheet.push(p.label+": "+vT(body)+" body / "+vT(pick)+" finished");
    });
    var body=document.getElementById("out");
    if(!rows.length){body.innerHTML='<p class="muted">Enter at least one measurement to see the finished sizes.</p>';return}
    var notes=[];
    var tightest=rows.slice().sort(function(a,b){return b.f.hi-a.f.hi})[0];
    if(tightest.f.hi>=17)notes.push("Your "+tightest.p.label.toLowerCase()+" needs about -"+r0(tightest.f.hi)+"%. That is at the limit of what can be pulled on: expect a tight fight getting in, and a higher risk of seam tears.");
    if(parseFloat(th)>=0.6&&garment.indexOf("neck entry")>-1)notes.push(th+" mm with a neck entry is very hard to put on. A back or front zipper is strongly recommended at this thickness.");
    if(exp==="first"&&parseFloat(th)>=0.6)notes.push("For a first garment, 0.40 mm is the usual starting point. Thicker sheeting is far less forgiving to wear.");
    if(who==="self")notes.push("Self-measurements are usually accurate to about 1–2 cm. Double-check your thigh, torso length and upper arm — those are the three parts customers most often get wrong.");
    var html='<h3 style="margin-top:0">Measurement sheet — '+garment+', '+matLabel+'</h3>';
    html+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.9rem">';
    html+='<thead><tr>'+["Measurement","Your body","Cut to this","Reduction"].map(function(h){return '<th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">'+h+'</th>'}).join("")+'</tr></thead><tbody>';
    rows.forEach(function(r){
      html+='<tr><td style="padding:11px 12px;border-bottom:1px solid var(--line)">'+r.p.label+'<span class="muted" style="display:block;font-size:.76rem">'+r.p.note+'</span></td>';
      html+='<td style="padding:11px 12px;border-bottom:1px solid var(--line)">'+vT(r.body)+'<span class="muted" style="display:block;font-size:.76rem">'+vT2(r.body)+'</span></td>';
      html+='<td style="padding:11px 12px;border-bottom:1px solid var(--line)">'+uT(r.f.smallest,r.f.largest)+'<span class="muted" style="display:block;font-size:.76rem">'+uT2(r.f.smallest,r.f.largest)+'</span></td>';
      html+='<td style="padding:11px 12px;border-bottom:1px solid var(--line)" class="muted">-'+r0(r.f.lo)+"% to -"+r0(r.f.hi)+'%</td></tr>';
    });
    html+='</tbody></table></div>';
    if(notes.length)html+='<div style="margin-top:18px;display:grid;gap:10px">'+notes.map(function(n){return '<p style="margin:0;padding:12px 14px;border-left:3px solid var(--accent);background:rgba(216,32,63,.07);font-size:.9rem;color:var(--ink2)">'+n+'</p>'}).join("")+'</div>';
    html+='<textarea id="sheet" readonly style="position:absolute;left:-9999px">'+sheet.join("\\n")+'</textarea>';
    body.innerHTML=html;
  }
  var calc=document.getElementById("calc");
  if(calc)calc.addEventListener("click",run);
  var copy=document.getElementById("copy");
  if(copy)copy.addEventListener("click",function(){
    var ta=document.getElementById("sheet");if(!ta){run();ta=document.getElementById("sheet")}
    if(ta){ta.select();document.execCommand("copy");copy.textContent="Copied"};
  });
  Array.prototype.forEach.call(document.querySelectorAll(".unit-input"),function(el){
    el.addEventListener("input",function(){var v=parseFloat(el.value);if(isFinite(v)&&v>0)run()})});
})();
</script>`;

const calcField = (id, label, note) => `<div><label class="lab" for="${id}" style="display:block">${label}${note ? `<span class="muted" style="text-transform:none;letter-spacing:0"> · ${note}</span>` : ''}</label><input class="chip unit-input" id="${id}" type="number" step="0.5" min="0" inputmode="decimal" placeholder="cm" style="width:100%;text-align:left;padding:11px 15px;background:var(--bg);color:var(--ink)"></div>`;
const calcSelect = (id, label, opts) => `<div><label class="lab" for="${id}" style="display:block">${label}</label><select id="${id}" class="chip" style="width:100%;text-align:left;padding:11px 15px;background:var(--bg);color:var(--ink)">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;

writePage('/size-calculator/', layout({
  title: `Latex Size Calculator — Finished Measurements to Cut | ${BRAND}`,
  description: 'Free latex size calculator. Enter your measurements and sheeting thickness to get the finished sizes a maker should cut, plus a sheet to send with your order.',
  url: '/size-calculator/', active: '/size-guide/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Size calculator', url: '/size-calculator/' }]), {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Latex Size Calculator',
    applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', url: `${SITE}/size-calculator/`,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    description: 'Calculates finished latex garment measurements from body measurements and sheeting thickness.',
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Size calculator</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Free tool</p>
    <h1>Latex size calculator</h1>
    <p class="lead">Enter your measurements and the sheet thickness you want. We apply the pattern reduction and return the finished measurements your garment should be cut to — plus a measurement sheet you can copy and send with your order.</p>
  </div></section>

  <section><div class="wrap">
    <div class="grid g2" style="gap:26px;align-items:start">
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px">
          <h3 style="margin:0">Your measurements</h3>
          <div style="display:flex;gap:6px"><button type="button" class="chip seg is-active" data-unit="cm">cm</button><button type="button" class="chip seg" data-unit="in">inches</button></div>
        </div>
        <div class="grid g2" style="gap:14px">
          ${calcSelect('garment', 'Garment', [['catsuit', 'Full catsuit'], ['neckentry', 'Catsuit (neck entry)'], ['dress', 'Dress'], ['top', 'Top / shirt'], ['leggings', 'Leggings / trousers']])}
          ${calcSelect('thickness', 'Latex thickness', [['0.25', '0.25 mm (ultra thin)'], ['0.40', '0.40 mm (standard)'], ['0.60', '0.60 mm (heavy)'], ['0.80', '0.80 mm (rigid)'], ['1.00', '1.00 mm (extra rigid)']])}
          ${calcSelect('fit', 'Fit', [['relaxed', 'Comfortable / easier to wear'], ['standard', 'Standard skin-tight'], ['snug', 'Extra tight / compression']])}
          ${calcSelect('exp', 'Experience', [['first', 'First latex garment'], ['some', 'I already own latex'], ['pro', 'Experienced wearer']])}
          ${calcSelect('who', 'Who is measuring', [['self', 'Me, with a tape'], ['other', 'Another person'], ['pro', 'Tailor / professional']])}
        </div>
        <hr style="border:0;border-top:1px solid var(--line);margin:22px 0">
        <div class="grid g2" style="gap:14px">
          ${calcField('chest', 'Chest / bust', 'widest')}
          ${calcField('underbust', 'Underbust', 'optional')}
          ${calcField('waist', 'Waist', 'narrowest')}
          ${calcField('hip', 'Hip', 'widest')}
          ${calcField('thigh', 'Thigh', 'upper, widest')}
          ${calcField('upperArm', 'Upper arm', 'relaxed')}
          ${calcField('neck', 'Neck', 'base')}
          ${calcField('torsoLength', 'Torso length', 'straight down')}
        </div>
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <button class="btn" id="calc" type="button">Calculate finished sizes</button>
          <button class="btn ghost" id="copy" type="button">Copy measurement sheet</button>
        </div>
      </div>
      <div>
        <div class="panel"><div id="out"><p class="muted">Enter at least one measurement to see the finished sizes.</p></div></div>
        <div class="panel" style="margin-top:18px">
          <h3 style="margin-bottom:12px">How to read this</h3>
          <p class="muted" style="font-size:.92rem;margin:0 0 12px">"Cut to this" is the finished measurement of the flat garment, not the size of body it fits. A latex piece is always made smaller than you are — that tension is what makes it cling.</p>
          <p class="muted" style="font-size:.92rem;margin:0">Not sure where the tape goes? Start with the <a href="/measure-guide/" style="color:var(--accent2)">measuring guide</a>.</p>
        </div>
      </div>
    </div>
    <div class="prose" style="margin-top:44px">
      <h2>What the calculator does</h2>
      <p>Natural latex is cut below body measurements so the sheet is already under tension when worn. The reduction depends on the sheet thickness: thinner sheet stretches further, so it is cut smaller. Our model uses <strong>14–17% at 0.25 mm</strong>, <strong>12–15% at 0.40 mm</strong>, <strong>10–13% at 0.60 mm</strong>, <strong>8–11% at 0.80 mm</strong> and <strong>6–9% at 1.00 mm</strong>, with small corrections for the neck, underbust, waist, thigh and upper arm where the body curves differently.</p>
      <p>Choose "Comfortable" if you want an easier garment to get into, "Extra tight" if you want maximum compression. If this is your first latex piece the calculator returns the looser end of the range; experienced wearers get the tighter end.</p>
      <p>Send the measurement sheet with your order and we cut from it. See also the <a href="/thickness-guide/">thickness guide</a> and the <a href="/size-guide/">size guide</a>.</p>
    </div>
  </div></section>
  ${CALC_JS}\n  ${LP_CHIP_JS}`,
}));

// THICKNESS GUIDE
const TH = [
  ['0.25 mm', '-14% to -17%', 'Easiest', 'First catsuit, warm climates, costumes, anything you expect to take on and off often.', 'Thin, almost like a second skin. Lightest to wear and the easiest to move in.', 'Stretches furthest, so it can be cut smallest and still go on.', 'Handle with care — thin sheet is most prone to fingernail damage and seam tears.'],
  ['0.40 mm', '-12% to -15%', 'Standard', 'Everyday wear, photography, a first serious catsuit, most made-to-measure orders.', 'The trade standard. Firm, glossy and still comfortable for a full evening.', 'Stretches well but noticeably less than 0.25 mm.', 'Good balance of strength and give, which is why most catsuits are made from it.'],
  ['0.60 mm', '-10% to -13%', 'Hard', 'Structured garments, heavy wear, buyers who dislike the second-skin feeling.', 'Heavier and more structured, holding its shape with less cling to the body.', 'Noticeably stiffer; seams and zips take more of the load when dressing.', 'Very hard-wearing. Popular for corsets, trousers and structured pieces.'],
  ['0.80 mm', '-8% to -11%', 'Very hard', 'Structured pieces, shoulder and hip definition, statement garments.', 'Rigid and weighty. It reads as armour rather than clothing.', 'Very little give. A garment this thick is cut close to the body or it will not go on.', 'Extremely durable, but stress concentrates at seams and closures.'],
  ['1.00 mm', '-6% to -9%', 'Very hard', 'Statement pieces, corsetry, chest and shoulder plates, garments that must hold a hard silhouette.', 'The heaviest sheet normally used for garments. Stiff, heavy and closer to armour plating.', 'Almost no give at all. The pattern sits very close to your body measurements.', 'Extremely strong sheet, but every bit of stress lands on the seams, zips and glue lines.'],
];
writePage('/thickness-guide/', layout({
  title: `Latex Thickness Guide — 0.25mm to 1.00mm | ${BRAND}`,
  description: 'How latex thickness changes stretch, durability, dressing difficulty and pattern reduction, from 0.25mm to 1.00mm — and how to choose for a first catsuit.',
  url: '/thickness-guide/', active: '/size-guide/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Thickness guide', url: '/thickness-guide/' }]), {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'What is the most common latex thickness for a catsuit?', acceptedAnswer: { '@type': 'Answer', text: '0.40 mm. It is the best compromise between stretch, durability and price, and most made-to-measure catsuits are cut from it.' } },
      { '@type': 'Question', name: 'Is 0.25 mm latex too thin?', acceptedAnswer: { '@type': 'Answer', text: 'Not for a first garment. Thin sheet stretches easily, which makes dressing and moving simpler. The trade-off is that it tears more readily, so nails and jewellery need care.' } },
      { '@type': 'Question', name: 'Why is 1.00 mm latex so hard to wear?', acceptedAnswer: { '@type': 'Answer', text: 'Because it barely stretches. A 1.00 mm garment has to be cut very close to your body measurements, so there is almost no slack to pull it on with.' } },
    ],
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Thickness guide</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Thickness guide</p>
    <h1>0.25 mm to 1.00 mm: what changes</h1>
    <p class="lead">Thickness is the single choice that changes everything else — how the garment feels, how long it lasts, how small the pattern can be cut, and how hard it is to get into. Thicker sheeting stretches less, so it takes <em>less</em> reduction, not more.</p>
  </div></section>

  <section class="tight"><div class="wrap"><div class="panel" style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
      <thead><tr>${['Thickness', 'Reduction', 'Dressing', 'Best for'].map(h => `<th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
      <tbody>${TH.map(r => `<tr><td style="padding:12px;border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap">${r[0]}</td><td style="padding:12px;border-bottom:1px solid var(--line);white-space:nowrap">${r[1]}</td><td style="padding:12px;border-bottom:1px solid var(--line)">${r[2]}</td><td style="padding:12px;border-bottom:1px solid var(--line)" class="muted">${r[3]}</td></tr>`).join('')}</tbody>
    </table>
  </div></div></section>

  <section><div class="wrap"><div class="grid g2" style="gap:20px">
    ${TH.map(r => `<div class="panel"><h3 style="margin-bottom:12px">${r[0]} latex</h3><dl class="spec"><dt>Feel</dt><dd>${r[4]}</dd><dt>Stretch</dt><dd>${r[5]}</dd><dt>Durability</dt><dd>${r[6]}</dd><dt>Best for</dt><dd>${r[3]}</dd></dl></div>`).join('')}
  </div></div></section>

  <section style="background:var(--bg2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap"><div class="prose">
    <h2>How to choose</h2>
    <p>If this is your first latex garment, choose <strong>0.40 mm</strong> unless you know you dislike the second-skin feeling — then go to 0.60 mm. Choose 0.25 mm when easy dressing and free movement matter more than long-term toughness. Choose 0.80 mm or 1.00 mm only for structured pieces where the garment is meant to hold a silhouette instead of following the body.</p>
    <p>Once you have chosen, enter your measurements in the <a href="/size-calculator/">size calculator</a> with that thickness selected. The reduction changes with the sheet, so the same body produces different finished sizes at 0.25 mm and at 1.00 mm.</p>
    <h2>Standard thickness on LatexPapa orders</h2>
    <p>We build in <strong>0.40 mm</strong> as standard. Anything from <strong>0.25 mm to 1.00 mm</strong> is available on request at no extra charge — the heavier sheets are used where a piece needs to hold its own shape. Metallic colours carry a 20% surcharge.</p>
  </div>
  <div class="faq" style="margin-top:34px">
    <details><summary>What is the most common latex thickness for a catsuit?</summary><div class="ans">0.40 mm. It is the best compromise between stretch, durability and price, and most made-to-measure catsuits are cut from it.</div></details>
    <details><summary>Is 0.25 mm latex too thin?</summary><div class="ans">Not for a first garment. Thin sheet stretches easily, which makes dressing and moving simpler. The trade-off is that it tears more readily, so nails and jewellery need care.</div></details>
    <details><summary>Why is 1.00 mm latex so hard to wear?</summary><div class="ans">Because it barely stretches. A 1.00 mm garment has to be cut very close to your body measurements, so there is almost no slack to pull it on with.</div></details>
  </div></div></section>`,
}));

// ABOUT
writePage('/about/', layout({
  title: `About LatexPapa — Handmade Latex Clothing Studio | ${BRAND}`,
  description: 'LatexPapa is a made-to-measure latex clothing studio. Every piece is glued and finished by hand from natural latex sheet, cut to the measurements you send.',
  url: '/about/', active: null,
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'About', url: '/about/' }]), {
    '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About LatexPapa', url: `${SITE}/about/`,
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>About</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">About us</p>
    <h1>We cut latex to you, not to a size chart</h1>
    <p class="lead">LatexPapa is a small studio making latex clothing to order. There is no warehouse of finished stock — every piece starts as flat sheet and a set of your measurements.</p>
  </div></section>
  <section><div class="wrap"><div class="prose">
    <h2>What we make</h2>
    <p>Around 100 designs, from full catsuits and colour-block dresses to hoods, gloves, stockings and small accessories. Everything is built from 100% natural latex: elastic, glossy, waterproof and, looked after properly, long-lasting. Standard sheeting is 0.40 mm; anything from 0.25 mm to 1.00 mm is available on request.</p>
    <h2>Why made to measure</h2>
    <p>Natural latex has no woven threads to hold a shape — it only hugs the body while it is stretched. That is why every maker cuts the pattern below your body measurements, and why a size letter means something slightly different at every studio. Rather than guess, we ask for numbers and cut from those. It costs you nothing extra and it is the difference between a garment that fits and one that fights you.</p>
    <h2>How an order works</h2>
    <ul>
      <li>Choose a piece and a colour. Colours outside the standard range and metallic finishes are available for +20%.</li>
      <li>Tell us whether you need a zip, where it goes, and any collar or hardware changes.</li>
      <li>We send a measurement sheet. The <a href="/measure-guide/">measuring guide</a> and <a href="/size-calculator/">size calculator</a> are there to help you fill it in.</li>
      <li>We check the numbers, come back to you if anything looks inconsistent, then cut.</li>
      <li>Gluing, seaming and finishing take ${PRODUCTION}. We photograph the piece before it ships.</li>
      <li>It leaves in plain, unmarked packaging with tracking, shipping free worldwide.</li>
    </ul>
    <h2>Where we are</h2>
    <p>${LEGAL} operates from Hong Kong and ships internationally. Questions before ordering are welcome — email <a href="mailto:${EMAIL}">${EMAIL}</a> or message us on WhatsApp at ${WHATSAPP}.</p>
  </div></div></section>`,
}));

// CONTACT
writePage('/contact/', layout({
  title: `Contact LatexPapa — Custom Latex Orders | ${BRAND}`,
  description: 'Ask about a custom latex piece, colours, sizing or an existing order. Email latexpapa@latexpapa.com or message us on WhatsApp.',
  url: '/contact/', active: null,
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Contact', url: '/contact/' }]), {
    '@context': 'https://schema.org', '@type': 'ContactPage', name: 'Contact LatexPapa', url: `${SITE}/contact/`,
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Contact</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Contact</p>
    <h1>Tell us what you want made</h1>
    <p class="lead">Send a photo, a sketch or a link. We will tell you what it costs, which thickness suits it, and what measurements we need.</p>
  </div></section>
  <section><div class="wrap"><div class="grid g3">
    <div class="tile"><h3>Email</h3><p>Best for measurements, order changes and anything with an attachment.</p><p style="margin-top:12px"><a class="btn ghost" href="mailto:${EMAIL}?subject=Latex%20order%20enquiry">${EMAIL}</a></p></div>
    <div class="tile"><h3>WhatsApp</h3><p>Fastest for quick questions, colour photos and delivery updates.</p><p style="margin-top:12px"><a class="btn ghost" href="https://wa.me/${WHATSAPP.replace(/[^0-9]/g, '')}">${WHATSAPP}</a></p></div>
    <div class="tile"><h3>Response time</h3><p>We reply to most messages within one working day. Measurement checks are done before cutting, so nothing is rushed.</p></div>
  </div>
  <div class="prose" style="margin-top:44px">
    <h2>Before you write</h2>
    <p>If your question is about fitting, the answer is probably in the <a href="/measure-guide/">measuring guide</a> or the <a href="/size-calculator/">size calculator</a>. If it is about timing, see <a href="/shipping-returns/">shipping</a>: production is ${PRODUCTION} and shipping is free worldwide. If it is about returns, see the <a href="/faq/">FAQ</a> — made-to-measure pieces cannot be returned unless defective.</p>
    <h2>Studio</h2>
    <p>${LEGAL} · Hong Kong SAR, China. We do not have a walk-in showroom; all orders are placed online or by message.</p>
  </div></div></section>`,
}));

// SHIPPING & RETURNS
writePage('/shipping-returns/', layout({
  title: `Shipping & Returns — Free Worldwide Delivery | ${BRAND}`,
  description: 'Free worldwide shipping: USA 7 business days, Europe 10, rest of the world 10–15. Production is 2 weeks. Made-to-measure items are not returnable.',
  url: '/shipping-returns/', active: '/shipping-returns/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Shipping & returns', url: '/shipping-returns/' }]), {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: 'How long does a LatexPapa order take?', acceptedAnswer: { '@type': 'Answer', text: 'Production is 2 weeks from the moment we confirm your measurements. Shipping is then 7 business days to the USA and Japan or Korea, 10 business days to Europe, and 10–15 business days elsewhere.' } },
      { '@type': 'Question', name: 'Is shipping free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Shipping is free on every order, worldwide, with tracking. Packaging is plain and unmarked.' } },
      { '@type': 'Question', name: 'Can I return a made-to-measure latex garment?', acceptedAnswer: { '@type': 'Answer', text: 'No. Because each piece is cut to your specific measurements it cannot be resold, so we do not accept returns or exchanges. If an item arrives defective, contact us within 48 hours of delivery and we will remake it or refund the defective part.' } },
    ],
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Shipping &amp; returns</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Shipping &amp; returns</p>
    <h1>Free worldwide shipping, ${PRODUCTION} in production</h1>
    <p class="lead">Every piece is made after you order it, so the clock starts when your measurements are confirmed — not when you pay.</p>
  </div></section>
  <section><div class="wrap"><div class="grid g3">
    <div class="tile"><h3>Production</h3><p><strong>${PRODUCTION}</strong> from measurement confirmation. Cutting, gluing, seaming and finishing are all done by hand.</p></div>
    <div class="tile"><h3>Shipping cost</h3><p><strong>Free</strong>, everywhere, tracked. No minimum order and no surcharge for remote destinations.</p></div>
    <div class="tile"><h3>Packaging</h3><p>Plain and unmarked, with no brand name on the outside. Discreet by default.</p></div>
  </div>
  <div class="panel" style="margin-top:26px;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:.92rem">
      <thead><tr>${['Destination', 'Transit time', 'Cost'].map(h => `<th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${[['United States', '7 business days', 'Free'], ['Europe', '10 business days', 'Free'], ['Japan &amp; Korea', '7 business days', 'Free'], ['Rest of the world', '10–15 business days', 'Free']].map(r => `<tr><td style="padding:12px;border-bottom:1px solid var(--line)">${r[0]}</td><td style="padding:12px;border-bottom:1px solid var(--line)">${r[1]}</td><td style="padding:12px;border-bottom:1px solid var(--line);color:var(--accent2)">${r[2]}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="muted" style="margin-top:14px;font-size:.88rem">Transit times are working days after dispatch and exclude customs clearance. Any import duty or tax charged on arrival is the buyer's responsibility.</p>

  <div class="prose" style="margin-top:44px">
    <h2>Returns and exchanges</h2>
    <p>Every garment is cut to the measurements you send, which means it cannot be resold to anyone else. For that reason <strong>we do not accept returns or exchanges</strong>, and this applies whether the piece is stock-sized or fully customised.</p>
    <p>Two things we do stand behind:</p>
    <ul>
      <li><strong>Defective workmanship.</strong> If a seam, glue line or fastener fails, or the garment is not built to the measurements you supplied, contact us within <strong>48 hours of delivery</strong> with photographs. We will remake the piece or refund the defective part.</li>
      <li><strong>Measurement check.</strong> We review every measurement sheet before cutting. If a number looks inconsistent with the others we will come back to you rather than guess.</li>
    </ul>
    <p>Because of this, please measure carefully and, if anything is unclear, ask before ordering. Our <a href="/measure-guide/">measuring guide</a> and <a href="/size-calculator/">size calculator</a> exist for exactly this reason.</p>
    <h2>Duties and taxes</h2>
    <p>Prices are in US dollars and exclude import duty. Depending on your country, customs may charge tax on delivery — that charge comes from your government, not from us, and we cannot predict or prepay it.</p>
    <div class="faq" style="margin-top:34px">
      <details><summary>How long does a LatexPapa order take?</summary><div class="ans">Production is 2 weeks from the moment we confirm your measurements. Shipping is then 7 business days to the USA and Japan or Korea, 10 business days to Europe, and 10–15 business days elsewhere.</div></details>
      <details><summary>Is shipping free?</summary><div class="ans">Yes. Shipping is free on every order, worldwide, with tracking. Packaging is plain and unmarked.</div></details>
      <details><summary>Can I return a made-to-measure latex garment?</summary><div class="ans">No. Because each piece is cut to your specific measurements it cannot be resold, so we do not accept returns or exchanges. If an item arrives defective, contact us within 48 hours of delivery and we will remake it or refund the defective part.</div></details>
    </div>
  </div></div></section>`,
}));

// FAQ
const FAQS = [
  ['Ordering', 'What exactly do I get for the price?', 'The finished garment, made to your measurements, in the colour and configuration you choose, shipped free with tracking. There is no separate charge for custom sizing.'],
  ['Ordering', 'Do I have to send measurements?', 'For anything fitted, yes. Latex has no universal sizing standard, so a size letter is a guess. Customisation costs nothing extra and is what most customers choose.'],
  ['Ordering', 'Can you make something that is not on the site?', 'Usually. Send a photo, a sketch or a link to <a href="mailto:' + EMAIL + '">' + EMAIL + '</a> and we will quote it. Custom design work is quoted per piece.'],
  ['Ordering', 'Can I pay in my own currency?', 'Prices are in US dollars. Your card issuer converts at their own rate, and card payments are available alongside PayPal, Apple Pay and Google Pay.'],
  ['Sizing', 'How do I know my measurements are right?', 'Use the <a href="/measure-guide/">measuring guide</a>, then check the numbers in the <a href="/size-calculator/">size calculator</a>. We also review every sheet before cutting and will query anything that looks inconsistent.'],
  ['Sizing', 'What if the garment does not fit?', 'If we built it outside the measurements you supplied, we remake it. If the measurements you supplied were wrong, we can usually alter the piece for the cost of the work — talk to us before assuming.'],
  ['Sizing', 'Does thickness affect the size?', 'Yes. Thinner sheet stretches further and is cut smaller: 14–17% reduction at 0.25mm against 6–9% at 1.00mm. See the <a href="/thickness-guide/">thickness guide</a>.'],
  ['Materials', 'What is the garment made of?', '100% natural latex sheeting, plus metal zips, eyelets or buckles where the design uses them. Standard thickness is 0.40mm.'],
  ['Materials', 'Can you match a specific colour?', 'Almost always. Send a photo in daylight. Standard colours are included; metallic finishes carry a 20% surcharge.'],
  ['Materials', 'Is latex vegan?', 'Natural latex is a plant-derived rubber, so the sheeting itself is vegan. Some shiners and polishes are not — tell us if you need a vegan finishing set.'],
  ['Care', 'How do I put it on?', 'Talc or silicone shiner on the inside, roll rather than pull, and keep nails and jewellery away from the sheet. Thin latex is cut smallest, so it is also the tightest to get into.'],
  ['Care', 'How do I wash it?', 'Rinse in lukewarm water with a little mild soap, rinse again, hang to dry in the shade, then store with talc in a cool dark place. Never use a washing machine, a dryer or an oil-based product.'],
  ['Shipping', 'When will it arrive?', 'Production is ' + PRODUCTION + ' after we confirm your measurements, then 7 business days to the USA, Japan and Korea, 10 to Europe and 10–15 elsewhere. Shipping is free.'],
  ['Shipping', 'Can you mark the parcel as a gift or lower the value?', 'No. Customs declarations must be accurate, and under-declaring is illegal in most destinations.'],
  ['Returns', 'Can I return it?', 'Not unless it is defective. Every piece is cut to your measurements and cannot be resold. Defects must be reported within 48 hours of delivery with photographs.'],
];
writePage('/faq/', layout({
  title: `Latex Clothing FAQ — Ordering, Sizing, Care, Delivery | ${BRAND}`,
  description: 'Answers on ordering made-to-measure latex, sizing and measurements, colours and thickness, care, free worldwide shipping and the returns policy.',
  url: '/faq/', active: '/faq/',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'FAQ', url: '/faq/' }]), {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQS.map(f => ({ '@type': 'Question', name: f[1], acceptedAnswer: { '@type': 'Answer', text: f[2].replace(/<[^>]+>/g, '') } })),
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>FAQ</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Questions</p>
    <h1>Frequently asked questions</h1>
    <p class="lead">Ordering, sizing, materials, care, delivery and returns. If your question is not here, email <a href="mailto:${EMAIL}" style="color:var(--accent2)">${EMAIL}</a>.</p>
  </div></section>
  <section><div class="wrap">
    ${[...new Set(FAQS.map(f => f[0]))].map(group => `<h2 style="margin-top:44px">${group}</h2>
    <div class="faq">${FAQS.filter(f => f[0] === group).map(f => `<details><summary>${f[1]}</summary><div class="ans">${f[2]}</div></details>`).join('')}</div>`).join('')}
  </div></section>`,
}));

// CUSTOM LATEX
writePage('/custom-latex/', layout({
  title: `Custom Latex Clothing — Bring Your Own Design | ${BRAND}`,
  description: 'Send a sketch, photo or reference and we will make it in natural latex, cut to your measurements. Colour matching, hardware changes, thickness to 1.00mm.',
  url: '/custom-latex/', active: null,
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Custom latex', url: '/custom-latex/' }]), {
    '@context': 'https://schema.org', '@type': 'Service', name: 'Custom latex garment design',
    provider: { '@type': 'Organization', name: LEGAL }, areaServed: 'Worldwide',
    description: 'Bespoke latex garments made from customer designs, cut to supplied measurements.',
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Custom latex</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Custom design</p>
    <h1>Bring us a design, we will cut it in latex</h1>
    <p class="lead">Everything on this site is already made to measure. This page is for the pieces that are not on the site yet — a sketch, a photo from a shoot, a costume, a two-piece you have in mind.</p>
    <div class="hero-actions"><a class="btn" href="mailto:${EMAIL}?subject=Custom%20latex%20design">Send your idea</a><a class="btn ghost" href="https://wa.me/${WHATSAPP.replace(/[^0-9]/g, '')}">WhatsApp us</a></div>
  </div></section>
  <section><div class="wrap"><div class="tiles">
    <div class="tile"><h3>1 · Send the idea</h3><p>A photo, a sketch, a screenshot or a link. Notes on colour, thickness and where zips should go are useful but not essential.</p></div>
    <div class="tile"><h3>2 · We quote it</h3><p>You get a price, a thickness recommendation and a production date before anything starts. No deposit until you approve.</p></div>
    <div class="tile"><h3>3 · Measurements</h3><p>We send the sheet. Use the <a href="/measure-guide/">guide</a> and <a href="/size-calculator/">calculator</a> if you want to check it yourself.</p></div>
    <div class="tile"><h3>4 · Pattern and build</h3><p>We draft the pattern, cut, glue and finish by hand. Larger jobs are photographed at the seam stage so you can approve.</p></div>
    <div class="tile"><h3>5 · Bulky and repeat orders</h3><p>Designs can run in multiples for photographers, performers and resellers. Ask for bulk pricing.</p></div>
    <div class="tile"><h3>6 · Shipping</h3><p>Free and tracked, plain packaging. Production ${PRODUCTION}, then 7–15 business days in transit.</p></div>
  </div>
  <div class="prose" style="margin-top:44px">
    <h2>What is easy to change</h2>
    <ul>
      <li><strong>Colour</strong> — almost any colour in the latex range; metallic adds 20%.</li>
      <li><strong>Thickness</strong> — 0.25mm, 0.40mm, 0.60mm, 0.80mm, 1.00mm.</li>
      <li><strong>Closures</strong> — front zip, back zip, crotch zip, neck entry, shoulder zip.</li>
      <li><strong>Hardware</strong> — metal buckles, D-rings, eyelets, lacing.</li>
      <li><strong>Trim</strong> — lace panels, colour-blocking, contrast seams.</li>
    </ul>
    <h2>What is harder</h2>
    <p>Very complex moulded shapes, permanently bonded foam padding and anything requiring a texture that natural latex sheet does not have. Tell us what you need and we will say honestly whether it is achievable — we would rather decline than deliver something that will not hold up.</p>
  </div></div></section>`,
}));

// CARE
writePage('/latex-care/', layout({
  title: `How to Care for Latex Clothing — Washing, Storage, Shine | ${BRAND}`,
  description: 'How to put on, wash, dry, store and polish natural latex clothing so it lasts: talc, silicone shiner, what to avoid, and how to fix a dull surface.',
  url: '/latex-care/', active: null,
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Latex care', url: '/latex-care/' }]), {
    '@context': 'https://schema.org', '@type': 'HowTo', name: 'How to care for latex clothing',
    step: [
      { '@type': 'HowToStep', name: 'Put it on', text: 'Talc the inside or use silicone shiner, roll the garment on rather than pulling, and keep nails and jewellery away from the sheet.' },
      { '@type': 'HowToStep', name: 'Wash', text: 'Rinse in lukewarm water with a little mild soap, then rinse again. Never use a washing machine or dryer.' },
      { '@type': 'HowToStep', name: 'Dry', text: 'Hang to dry in the shade, away from direct sun and heat, then pat the surface dry.' },
      { '@type': 'HowToStep', name: 'Store', text: 'Dust with talc, fold flat or hang, and store in a cool dark place away from metal and sunlight.' },
    ],
  }],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Latex care</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Care</p>
    <h1>Looking after natural latex</h1>
    <p class="lead">Latex is durable but particular. Treated well, a garment keeps its shine for years; treated badly, it goes dull or tears at the seams within a few wears.</p>
  </div></section>
  <section><div class="wrap"><div class="grid g2" style="gap:20px">
    <div class="panel"><h3>Putting it on</h3><ul class="bullets" style="border-top:0"><li>Talc the inside, or use a silicone shiner as a dressing aid</li><li>Roll the garment on — never pull it on like knitwear</li><li>Remove rings and check your nails first</li><li>Thin sheet (0.25mm) is the least forgiving to put on</li></ul></div>
    <div class="panel"><h3>Washing</h3><ul class="bullets" style="border-top:0"><li>Lukewarm water and a little mild soap</li><li>Wash by hand, inside and out, then rinse thoroughly</li><li>Never machine wash, tumble dry, iron or dry clean</li><li>Never use oil-based cleaners, alcohol or solvents</li></ul></div>
    <div class="panel"><h3>Drying and storing</h3><ul class="bullets" style="border-top:0"><li>Hang or lay flat to dry in the shade</li><li>Never dry in sunlight or near a radiator — heat perishes latex</li><li>Dust with talc before storing so the sheet does not stick to itself</li><li>Store flat or hung in a cool, dark place</li></ul></div>
    <div class="panel"><h3>Things that damage latex</h3><ul class="bullets" style="border-top:0"><li>Copper, brass and bronze — contact stains the sheet permanently</li><li>Oil, grease, lotions, perfume and sunscreen</li><li>Prolonged sunlight and UV</li><li>Nails, jewellery, velcro and rough surfaces</li></ul></div>
  </div>
  <div class="prose" style="margin-top:44px">
    <h2>Shine and dulling</h2>
    <p>New sheet is glossy; handling and talc leave it matt. Silicone shiner restores the gloss — apply a little with a soft cloth, work it in evenly, and buff off the excess. Wash the garment before shining it, or you will seal dust into the surface.</p>
    <p>If the surface has gone tacky rather than dull, it usually means it was stored without talc in a warm place. Wash it, dry it thoroughly, talc it and store it cooler.</p>
    <h2>Repairs</h2>
    <p>Small seam separations can be glued with latex adhesive and a patch of matching sheet. If a piece fails within 48 hours of delivery, contact us instead — see <a href="/shipping-returns/">shipping and returns</a>.</p>
    <h2>Allergies</h2>
    <p>Natural latex contains proteins that a small number of people react to. If you know you have a latex allergy, do not order. We cannot make these designs in a substitute material.</p>
  </div></div></section>`,
}));

// WHOLESALE
writePage('/wholesale/', layout({
  title: `Wholesale & Bulk Latex Orders for Studios and Retailers | ${BRAND}`,
  description: 'Bulk and resale latex orders for photographers, performers, retailers and studios. Custom colourways, repeat runs and consolidated shipping.',
  url: '/wholesale/', active: null,
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Wholesale', url: '/wholesale/' }])],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Wholesale</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Wholesale &amp; bulk</p>
    <h1>Repeat runs for studios and retailers</h1>
    <p class="lead">We already make to order, so running a design in multiples is a change of quantity rather than a change of process. Tell us the design, the colourway, the sizes and the date you need it.</p>
    <div class="hero-actions"><a class="btn" href="mailto:${EMAIL}?subject=Wholesale%20enquiry">Request bulk pricing</a></div>
  </div></section>
  <section><div class="wrap"><div class="tiles">
    <div class="tile"><h3>What we can do</h3><p>Repeat production of any design on the site, plus customer designs. Consistent colourways across a run, and measurement sets held on file for repeat orders.</p></div>
    <div class="tile"><h3>Quantities</h3><p>From five pieces upward. Larger runs are scheduled in batches and quoted with a production calendar before you commit.</p></div>
    <div class="tile"><h3>Shipping</h3><p>Consolidated shipments to one address, free. Split shipments to multiple destinations can be arranged.</p></div>
    <div class="tile"><h3>Photography and rental houses</h3><p>Costume pieces for shoots, with fast turnaround where the calendar allows. Ask about a spare stock piece for sizing.</p></div>
    <div class="tile"><h3>Retail</h3><p>Unbranded packaging available for resale, and your labels can be sewn in on request.</p></div>
    <div class="tile"><h3>Payment</h3><p>Card, PayPal and bank transfer. Larger orders are invoiced 50% on order, 50% before dispatch.</p></div>
  </div>
  <div class="prose" style="margin-top:44px">
    <h2>What to include in your enquiry</h2>
    <ul><li>Design or reference (a link to a product page is fine)</li><li>Quantity per size and colour</li><li>Thickness</li><li>Deadline</li><li>Delivery country</li></ul>
    <p>Email <a href="mailto:${EMAIL}">${EMAIL}</a> or WhatsApp ${WHATSAPP}. We will confirm price, production window and shipping before you commit.</p>
  </div></div></section>`,
}));

// TRACK ORDER
writePage('/track-order/', layout({
  title: `Track Your Order | ${BRAND}`,
  description: 'Tracking information for LatexPapa orders, plus what to do if your parcel has not moved or has not arrived.',
  url: '/track-order/', active: null, robots: 'noindex,follow',
  jsonLd: [ORG, crumbs([{ name: 'Home', url: '/' }, { name: 'Track order', url: '/track-order/' }])],
  body: `<div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span>Track order</nav></div>
  <section class="tight"><div class="wrap">
    <p class="eyebrow">Order status</p>
    <h1>Where is my order?</h1>
    <p class="lead">Tracking numbers are emailed when your parcel leaves the studio, normally ${PRODUCTION} after we confirm your measurements.</p>
  </div></section>
  <section><div class="wrap"><div class="tiles">
    <div class="tile"><h3>Still in production</h3><p>Most pieces take ${PRODUCTION}. If you have not had a measurement check yet, we are waiting on your numbers.</p></div>
    <div class="tile"><h3>Shipped</h3><p>Use the tracking link in your dispatch email. Transit is 7 business days to the USA, Japan and Korea, 10 to Europe, 10–15 elsewhere.</p></div>
    <div class="tile"><h3>No movement for a week</h3><p>Send us the tracking number and we will chase the carrier. Do not open a dispute first — it slows the carrier down.</p></div>
  </div>
  <div class="prose" style="margin-top:44px">
    <h2>Need help</h2>
    <p>Email <a href="mailto:${EMAIL}?subject=Order%20tracking">${EMAIL}</a> or WhatsApp ${WHATSAPP} with your order number. We answer most messages within one working day.</p>
  </div></div></section>`,
}));

/* ---------- PAGE_404 ---------- */
fs.writeFileSync(path.join(OUT, '404.html'), layout({
  title: 'Page not found | ' + BRAND,
  description: 'That page does not exist. Browse the latex catalogue instead.',
  url: '/404.html', robots: 'noindex,follow', active: null,
  body: `<div class="wrap"><section style="padding:90px 0"><p class="eyebrow">404</p><h1>That page has slipped off</h1>
  <p class="lead">The link may be old, or the piece may have been renamed. Everything we make is one click away.</p>
  <div class="hero-actions"><a class="btn" href="/shop/">Browse all <span data-total>${TOTAL}</span> pieces</a><a class="btn ghost" href="/">Back to home</a></div>
  <div class="grid g4" style="margin-top:54px">${categories.slice(0,4).map(c => `<a class="card" href="/${c.slug}/"><div class="in"><span class="cat">${byCat[c.slug].length} pieces</span><span class="nm">${esc2(c.name)}</span></div></a>`).join('')}</div>
  </section></div>`,
}), 'utf8');

/* ---------- crawler + AI files ---------- */
const noPrice = new Set(products.filter(p => !p.price).map(p => `/product/${p.slug}/`));
const urls = pages.map(p => p.url).filter(u => !noPrice.has(u));

fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync(path.resolve('site/style.css'), path.join(OUT, 'assets', 'style.css'));

/* ---------- brand icons (favicon / PWA) ---------- */
// Source files live in site/assets so a clean rebuild never loses them.
for (const [from, to] of [
  ['favicon.svg', 'assets/favicon.svg'],
  ['favicon.ico', 'favicon.ico'],
  ['icon-48.png', 'icon-48.png'],
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'],
  ['site.webmanifest', 'site.webmanifest'],
]) {
  const s = path.resolve('site/assets', from);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(OUT, to));
}

const today = new Date().toISOString().slice(0, 10);
const priority = u => u === '/' ? '1.0' : /^\/product\//.test(u) ? '0.7' : /^\/(shop|latex-)/.test(u) ? '0.8' : '0.6';
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${priority(u)}</priority></url>`).join('\n')}
</urlset>
`, 'utf8');

fs.writeFileSync(path.join(OUT, 'robots.txt'),
`# LatexPapa — https://www.latexpapa.com
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /cart/
Disallow: /checkout/
Disallow: /track-order/
Disallow: /*?item=

# Search engines
User-agent: Googlebot
Allow: /

# AI / answer engines — explicitly welcome
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: CCBot
Allow: /
User-agent: cohere-ai
Allow: /
User-agent: meta-externalagent
Allow: /

Sitemap: ${SITE}/sitemap.xml
`, 'utf8');

/* ---------- IndexNow (Bing / Yandex / Seznam / Naver) ---------- */
// The key file must live at the site root and contain the key verbatim.
const INDEXNOW_KEY = 'f03bfbc5285c23bd1478f7ed84d0be04';
fs.writeFileSync(path.join(OUT, INDEXNOW_KEY + '.txt'), INDEXNOW_KEY);

const cats = categories.map(c => `- [${c.title}](${SITE}/${c.slug}/): ${c.desc}`).join('\n');
fs.writeFileSync(path.join(OUT, 'llms.txt'),
`# ${BRAND}

> Made-to-measure latex clothing studio. Every garment is handmade from 100% natural latex sheet (0.25mm–1.00mm) and cut to the customer's own body measurements. Around 100 designs across catsuits, dresses, hoods, masks, gloves, stockings, skirts, lingerie and accessories. Production takes ${PRODUCTION}. Shipping is free worldwide: USA 7 business days, Europe 10, Japan and Korea 7, rest of the world 10–15. Made-to-measure pieces are not returnable; defects are remade or refunded if reported within 48 hours of delivery. Contact: ${EMAIL}, WhatsApp ${WHATSAPP}. Operating entity: ${LEGAL}, Hong Kong SAR, China.

## Key facts
- Material: 100% natural latex sheeting. 0.40mm standard; 0.25mm, 0.60mm, 0.80mm and 1.00mm available.
- Sizing: no size letters. Customers send body measurements (chest, underbust, waist, hip, thigh, upper arm, neck, torso length, height). Pattern reduction by thickness: 14–17% at 0.25mm, 12–15% at 0.40mm, 10–13% at 0.60mm, 8–11% at 0.80mm, 6–9% at 1.00mm.
- Colour: any colour in the latex range; metallic finishes +20%.
- Production time: ${PRODUCTION} from measurement confirmation.
- Shipping: free and tracked worldwide, plain unmarked packaging.
- Returns: not accepted, except for defects reported within 48 hours of delivery.
- Payments: credit and debit cards, PayPal, Apple Pay and Google Pay. Prices in USD.

## Categories
${cats}

## Shop
- [All products](${SITE}/shop/): Complete catalogue, ${products.length} pieces.
${products.filter(p => p.price).map(p => `- [${p.name}](${SITE}/product/${p.slug}/) — ${money(p.price)}`).join('\n')}

## Guides and tools
- [How to measure for latex clothing](${SITE}/measure-guide/): The nine body measurements latex makers need, and the three that are most often taken wrongly.
- [Latex size calculator](${SITE}/size-calculator/): Enter body measurements and sheeting thickness to get the finished measurements a garment should be cut to.
- [Latex thickness guide](${SITE}/thickness-guide/): How 0.25mm–1.00mm changes stretch, durability, dressing difficulty and pattern reduction.
- [Size guide](${SITE}/size-guide/): Why latex has no sizing standard and how the reduction works.
- [Latex care](${SITE}/latex-care/): Washing, drying, storing, shining and repairing latex.

## Company
- [About](${SITE}/about/)
- [Custom latex design](${SITE}/custom-latex/)
- [Shipping and returns](${SITE}/shipping-returns/)
- [FAQ](${SITE}/faq/)
- [Contact](${SITE}/contact/)
- [Wholesale](${SITE}/wholesale/)
`, 'utf8');


/* ---------- admin panel + pages worker ---------- */
const ADMIN_SRC = path.resolve('site/admin/index.html');
if (fs.existsSync(ADMIN_SRC)) {
  const adm = fs.readFileSync(ADMIN_SRC, 'utf8')
    .replace('[/*__CATEGORIES__*/]', JSON.stringify(categories.map(c => ({ slug: c.slug, name: c.name }))));
  fs.mkdirSync(path.join(OUT, 'admin'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'admin', 'index.html'), adm, 'utf8');
  console.log('admin panel staged: /admin/');
}
const WORKER_DIR = path.resolve('site/worker');
if (fs.existsSync(WORKER_DIR)) {
  for (const name of ['_worker.js', '_routes.json']) {
    const src = path.join(WORKER_DIR, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, name));
  }
  console.log('pages worker staged');
}

console.log('BUILD COMPLETE');
console.log('pages:', pages.length);
console.log('products:', products.length);
console.log('categories:', categories.length);
console.log('sitemap urls:', urls.length);
const missing = products.filter(p => !fs.existsSync(path.join(OUT, `img/${p.id}/01.webp`)));
console.log('products using remote image fallback:', missing.length);
