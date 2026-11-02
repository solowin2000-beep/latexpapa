const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(bytes) {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sign(data, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}
function money(n) { return '$' + Number(n || 0).toFixed(2); }

const COOKIE = 'lp_admin';
const secretOf = env => env.ADMIN_SECRET || env.ADMIN_PASSWORD || 'latexpapa-fallback';
/* ---------- checkout: PayPal (totals are always recomputed here) ---------- */
// CATALOG is injected at build time by site/build.mjs — slug -> { p: price, n: name }.
// A price sent by the browser is never trusted.
const CATALOG = /*__CATALOG__*/ {};
const CURRENCY = 'USD';
const paypalEnv = env => (String(env.PAYPAL_ENV || '').toLowerCase() === 'sandbox' ? 'sandbox' : 'live');
const paypalBase = env => (paypalEnv(env) === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
const paypalReady = env => !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);

let PP_TOKEN = { key: '', value: '', exp: 0 };
async function paypalToken(env) {
  const key = paypalEnv(env) + '|' + env.PAYPAL_CLIENT_ID;
  if (PP_TOKEN.key === key && PP_TOKEN.value && PP_TOKEN.exp > Date.now()) return PP_TOKEN.value;
  const res = await fetch(paypalBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_CLIENT_SECRET),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('paypal-auth-' + res.status);
  const j = await res.json();
  if (!j.access_token) throw new Error('paypal-auth-no-token');
  PP_TOKEN = { key, value: j.access_token, exp: Date.now() + Math.max(60, (Number(j.expires_in) || 3000) - 120) * 1000 };
  return PP_TOKEN.value;
}

async function paypalFetch(env, path, method, body, extra) {
  const token = await paypalToken(env);
  const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
  if (extra) for (const k in extra) headers[k] = extra[k];
  const res = await fetch(paypalBase(env) + path, {
    method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + String(text).slice(0, 180));
  try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
}

// Turn whatever the browser posted into trusted order lines.
function cartLines(items) {
  const out = [];
  const seen = {};
  const list = Array.isArray(items) ? items : [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const slug = String(it.slug || '').slice(0, 80);
    const entry = CATALOG[slug];
    if (!entry || !(Number(entry.p) > 0)) continue;
    let qty = Math.floor(Number(it.qty) || 1);
    if (!(qty >= 1)) qty = 1;
    if (qty > 20) qty = 20;
    if (seen[slug]) { seen[slug].qty = Math.min(20, seen[slug].qty + qty); continue; }
    if (out.length >= 40) break;
    seen[slug] = { slug, name: String(entry.n || slug).slice(0, 127), price: Number(entry.p), qty };
    out.push(seen[slug]);
  }
  return out;
}
function linesTotal(lines) { return Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100; }
async function readOrders(env) {
  const raw = await env.LATEXPAPA_DATA.get('orders');
  if (!raw) return [];
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}
function orderRef(id) { return 'LP-' + String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase(); }
const ORDER_STATUSES = ['awaiting', 'paid', 'shipped', 'cancelled', 'refunded'];

async function writeOrders(env, list) {
  while (list.length > 600) list.pop();
  await env.LATEXPAPA_DATA.put('orders', JSON.stringify(list));
}

// upsertOrder — create or patch one order keyed by its PayPal order id.
async function upsertOrder(env, paypalId, patch, event) {
  const list = await readOrders(env);
  let rec = list.find(o => o.paypalId === paypalId);
  if (!rec) {
    rec = {
      id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      paypalId, ref: orderRef(paypalId), status: 'awaiting',
      created: new Date().toISOString(), timeline: [],
    };
    list.unshift(rec);
  }
  for (const k in patch) if (patch[k] !== undefined) rec[k] = patch[k];
  rec.updatedAt = new Date().toISOString();
  if (event) { rec.timeline = rec.timeline || []; rec.timeline.push({ at: rec.updatedAt, event }); }
  await writeOrders(env, list);
  return rec;
}

function shippingOf(ord) {
  const pu = (ord && Array.isArray(ord.purchase_units) && ord.purchase_units[0]) || {};
  const sh = pu.shipping || {};
  const a = sh.address || {};
  const nm = sh.name ? (sh.name.full_name || [sh.name.given_name, sh.name.surname].filter(Boolean).join(' ')) : '';
  const line = [a.address_line_1, a.address_line_2, a.admin_area_2, a.admin_area_1, a.postal_code, a.country_code]
    .filter(Boolean).join(', ');
  return { name: nm || '', address: line };
}
function customerOf(ord) {
  const payer = (ord && ord.payer) || {};
  const sh = shippingOf(ord);
  const p = payer.name || {};
  return {
    email: payer.email_address || '',
    name: sh.name || [p.given_name, p.surname].filter(Boolean).join(' ') || '',
  };
}
function publicOrder(o) {
  return {
    id: o.id, ref: o.ref, status: o.status || 'awaiting',
    paypalId: o.paypalId || '', captureId: o.captureId || '',
    total: Number(o.total || 0), currency: o.currency || CURRENCY,
    items: Array.isArray(o.items) ? o.items : [], note: o.note || '',
    payer: o.payer || '',
    customer: o.customer || { email: '', name: '' },
    shipping: o.shipping || { name: '', address: '' },
    carrier: o.carrier || '', tracking: o.tracking || '',
    created: o.created || '', paidAt: o.paidAt || '', shippedAt: o.shippedAt || '',
    updatedAt: o.updatedAt || '', timeline: Array.isArray(o.timeline) ? o.timeline : [],
    notify: o.notify || null,
  };
}



// notifyOrder - best effort only; never blocks a payment.
// NOTIFY_WEBHOOK may hold several URLs separated by spaces or commas; they are
// tried in order and the first one that succeeds wins (so a dead mirror does
// not silence the alert, and the owner never gets duplicates).
function channelOf(hook) {
  let host = '';
  try { host = new URL(hook).hostname.toLowerCase(); } catch (e) { return 'webhook'; }
  if (host.indexOf('ntfy.') === 0 || host.indexOf('.ntfy.') >= 0) return 'ntfy';
  if (host.indexOf('qyapi.weixin.qq.com') >= 0) return 'wecom';
  if (host.indexOf('dingtalk.com') >= 0) return 'dingtalk';
  if (host.indexOf('sctapi.ftqq.com') >= 0 || host.indexOf('ft07.com') >= 0) return 'serverchan';
  if (host.indexOf('api.day.app') >= 0) return 'bark';
  if (host.indexOf('telegram.org') >= 0) return 'telegram';
  if (host.indexOf('slack.com') >= 0) return 'slack';
  if (host.indexOf('discord') >= 0) return 'discord';
  return 'webhook';
}
function displayOf(ch) {
  if (ch === 'ntfy') return 'phone push';
  if (ch === 'wecom') return 'WeCom group bot';
  if (ch === 'dingtalk') return 'DingTalk group bot';
  if (ch === 'serverchan') return 'ServerChan (WeChat)';
  if (ch === 'bark') return 'Bark (iPhone)';
  if (ch === 'telegram') return 'Telegram';
  if (ch === 'slack') return 'Slack';
  if (ch === 'discord') return 'Discord';
  if (ch === 'email') return 'email';
  if (ch === 'webhook') return 'custom webhook';
  return 'off';
}
function notifyHooks(env) {
  return String(env.NOTIFY_WEBHOOK || '').split(',').join(' ').split(' ').map(s => s.trim()).filter(Boolean);
}
function notifyChannel(env) {
  const hooks = notifyHooks(env);
  if (hooks.length) return channelOf(hooks[0]);
  if (env.WEB3FORMS_KEY) return 'email';
  return '';
}
function notifyLabel(env) {
  const hooks = notifyHooks(env);
  const c = notifyChannel(env);
  if (c === 'off' || !c) return 'off';
  return displayOf(c) + (hooks.length > 1 ? ' (x' + hooks.length + ' fallback)' : '');
}
function orderText(rec) {
  const nl = String.fromCharCode(10);
  const title = 'LatexPapa order ' + rec.ref;
  const text = title + nl + (rec.items || []).map(i => i.name + ' x' + i.qty).join(nl) +
    nl + 'Total: ' + money(rec.total) + ' ' + (rec.currency || CURRENCY) +
    (rec.note ? nl + 'Note: ' + rec.note : '') +
    (rec.customer && rec.customer.email ? nl + 'Email: ' + rec.customer.email : '') +
    (rec.shipping && rec.shipping.address ? nl + 'Ship to: ' + rec.shipping.address : '') +
    nl + nl + 'Orders: https://www.latexpapa.com/admin/';
  return { title, text };
}
async function pushOne(ch, hook, env, title, text) {
  const res = { channel: ch, display: displayOf(ch), ok: false, status: 0, error: '' };
  try {
    let url = hook;
    let init = null;
    if (ch === 'ntfy') {
      const parts = new URL(hook);
      const topic = parts.pathname.split('/').filter(Boolean)[0] || '';
      url = parts.origin + '/';
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, title, message: text, tags: ['shopping_cart'], priority: 4 }) };
    } else if (ch === 'wecom' || ch === 'dingtalk') {
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'text', text: { content: text } }) };
    } else if (ch === 'serverchan') {
      init = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'title=' + encodeURIComponent(title) + '&desp=' + encodeURIComponent(text) };
    } else if (ch === 'bark') {
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, body: text }) };
    } else if (ch === 'telegram') {
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.NOTIFY_CHAT_ID || '', text, disable_web_page_preview: true }) };
    } else if (ch === 'discord') {
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: text }) };
    } else {
      init = { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, content: text, title, message: text }) };
    }
    const r = await fetch(url, init);
    res.status = r.status;
    res.ok = !!r.ok;
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      res.error = ('HTTP ' + r.status + ' ' + t).slice(0, 160);
    }
  } catch (e) { res.error = String((e && e.message) || e).slice(0, 160); }
  return res;
}
async function notifyOrder(env, rec) {
  const { title, text } = orderText(rec);
  const results = [];
  const hooks = notifyHooks(env);
  for (const hook of hooks) {
    const r = await pushOne(channelOf(hook), hook, env, title, text);
    results.push(r);
    if (r.ok) break;
  }
  if (env.WEB3FORMS_KEY) {
    const e = { channel: 'email', display: 'email', ok: false, status: 0, error: '' };
    try {
      const r = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_key: env.WEB3FORMS_KEY, subject: title, from_name: 'LatexPapa shop',
          email: env.NOTIFY_EMAIL || 'latexpapa@latexpapa.com', message: text }),
      });
      const body = await r.json().catch(() => ({}));
      e.status = r.status;
      e.ok = !!(r.ok && body && body.success !== false);
      if (!e.ok) e.error = ('HTTP ' + r.status).slice(0, 160);
    } catch (err) { e.error = String((err && err.message) || err).slice(0, 160); }
    results.push(e);
  }
  const won = results.filter(r => r.ok)[0] || null;
  const failed = results.filter(r => !r.ok);
  return {
    ok: !!won,
    channel: won ? won.channel : (results.length ? results[0].channel : ''),
    label: won ? won.display : (results.length ? results[0].display : 'off'),
    status: results.length ? results[results.length - 1].status || 0 : 0,
    error: won ? '' : (failed.length ? (failed[0].error || 'HTTP ' + failed[0].status) : 'no alert channel is set up yet'),
    tried: results.map(r => r.display + '=' + (r.ok ? 'ok' : 'fail')),
  };
}

async function saveNotify(env, rec, nres) {
  try {
    const list = await readOrders(env);
    const patch = { notify: {
      at: new Date().toISOString(),
      channel: (nres && nres.label) || '',
      ok: !!(nres && nres.ok),
      status: (nres && nres.status) || 0,
      error: (nres && nres.error) || '',
    } };
    const at = list.findIndex(o => (o.id && o.id === rec.id) || (o.paypalId && o.paypalId === rec.paypalId));
    if (at >= 0) list[at] = Object.assign({}, list[at], patch);
    else list.unshift(Object.assign({}, rec, patch));
    await writeOrders(env, list);
  } catch (e) {}
}

async function newSession(env) {
  const payload = b64u(enc.encode(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })));
  return payload + '.' + (await sign(payload, secretOf(env)));
}
async function isAuthed(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)lp_admin=([^;]+)/);
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 2) return false;
  if (!safeEqual(await sign(parts[0], secretOf(env)), parts[1])) return false;
  try {
    const o = JSON.parse(dec.decode(b64uDecode(parts[0])));
    return typeof o.exp === 'number' && o.exp > Date.now();
  } catch (e) { return false; }
}

async function readProducts(env) {
  const raw = await env.LATEXPAPA_DATA.get('products');
  if (!raw) return [];
  try { const j = JSON.parse(raw); return Array.isArray(j) ? j : []; } catch (e) { return []; }
}

function navHtml() {
  return '<div class="note"><b>Free worldwide shipping</b> &middot; Made to measure in 2 weeks &middot; 100% natural latex &middot; Questions? <a href="/contact/">Talk to us</a></div>' +
    '<header class="top"><div class="wrap"><a class="logo" href="/">Latex<span>Papa</span></a>' +
    '<button class="navbtn" type="button" id="navbtn" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu"><span class="navbtn-box"><span></span><span></span><span></span></span></button>' +
    '<nav class="nav" id="primary-nav" aria-label="Main">' +
    '<a href="/latex-catsuits/">Catsuits</a><a href="/latex-hoods-masks/">Hoods &amp; Masks</a><a href="/latex-dresses/">Dresses</a>' +
    '<a href="/latex-gloves/">Gloves</a><a href="/latex-stockings-socks/">Stockings</a><a href="/latex-accessories/">Accessories</a>' +
    '<a href="/shop/">All products</a><a href="/size-guide/">Size &amp; Fit</a>' +
    '<a class="nav-cta" href="/custom-latex/">Start a custom piece</a></nav>' +
    '<a class="btn cta" href="/custom-latex/">Start a custom piece</a></div></header>';
}

function productPage(p, origin) {
  const rel = p.images || [];
  const abs = rel.map(u => (u.startsWith('http') ? u : origin + u));
  const hero = abs[0] || '';
  const cat = p.categoryName || 'Made to measure';
  const desc = p.descriptionHtml || ('<p>' + esc(p.name) + ' &mdash; made to measure in 100% natural latex.</p>');
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name, description: String(p.metaDescription || p.name),
    brand: { '@type': 'Brand', name: 'LatexPapa' }, category: cat,
    offers: {
      '@type': 'Offer', price: Number(p.price || 0).toFixed(2), priceCurrency: 'USD',
      availability: 'https://schema.org/InStock', url: origin + '/product/' + p.slug + '/',
    },
  };
  if (hero) ld.image = abs;
  const thumbs = rel.length > 1
    ? '<div class="thumbs">' + rel.map((u, i) => '<img class="thumb' + (i === 0 ? ' on' : '') + '" src="' + esc(abs[i]) + '" data-full="' + esc(abs[i]) + '" alt="' + esc(p.name) + ' photo ' + (i + 1) + '" loading="lazy">').join('') + '</div>'
    : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(p.name) + ' &mdash; Made to Measure | LatexPapa</title>' +
    '<meta name="description" content="' + esc(p.metaDescription || (p.name + ' made to measure in 100% natural latex. Any colour, free worldwide shipping, 2 week production.')) + '">' +
    '<link rel="canonical" href="' + origin + '/product/' + esc(p.slug) + '/">' +
    '<meta name="robots" content="index,follow,max-image-preview:large">' +
    '<meta property="og:type" content="product"><meta property="og:title" content="' + esc(p.name) + '">' +
    '<meta property="og:url" content="' + origin + '/product/' + esc(p.slug) + '/">' +
    (hero ? '<meta property="og:image" content="' + esc(hero) + '"><meta name="twitter:card" content="summary_large_image">' : '') +
    '<link rel="stylesheet" href="/assets/style.css">' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script></head><body>' +
    navHtml() +
    '<main><div class="wrap"><nav class="crumbs"><a href="/">Home</a><span>/</span><a href="/shop/">Shop</a><span>/</span>' + esc(p.name) + '</nav>' +
    '<div class="pdp"><div class="gallery">' +
    '<div class="main"><img id="hero" src="' + esc(hero) + '" alt="' + esc(p.name) + '" width="1100" height="1100"></div>' + thumbs + '</div>' +
    '<div><p class="eyebrow">' + esc(cat) + ' &middot; Made to measure</p><h1>' + esc(p.name) + '</h1>' +
    '<div class="pricebox"><span class="p">' + money(p.price) + '</span>' +
    (p.wasPrice && Number(p.wasPrice) > Number(p.price) ? '<span class="w">' + money(p.wasPrice) + '</span>' : '') + '</div>' +
    '<ul class="bullets"><li>Made to your exact measurements</li><li>100% natural latex, 0.25mm&ndash;1.00mm</li><li>Any colour, including metallic (+20%)</li><li>Free worldwide shipping</li><li>Production time about 2 weeks</li></ul>' +
    '<div class="hero-actions"><a class="btn" href="/contact/">Order this piece</a><a class="btn ghost" href="/measure-guide/">How to measure</a></div>' +
    '</div></div>' +
    '<section class="tight"><div class="prose">' + desc + '</div></section>' +
    '</div></main>' +
    '<footer class="foot"><div class="wrap"><div class="base"><span>&copy; ' + new Date().getFullYear() + ' LATEXPAPA. All rights reserved.</span><span>Prices in USD &middot; Free worldwide shipping</span></div></div></footer>' +
    '<script>var b=document.getElementById("navbtn"),n=document.getElementById("primary-nav");if(b&&n){b.addEventListener("click",function(){n.classList.toggle("open");b.classList.toggle("on")})}' +
    'document.querySelectorAll(".thumbs").forEach(function(g){g.addEventListener("click",function(e){var t=e.target.closest(".thumb");if(!t)return;g.querySelectorAll(".thumb").forEach(function(c){c.classList.remove("on")});t.classList.add("on");var h=document.getElementById("hero");if(h)h.src=t.getAttribute("data-full")})});</script>' +
    '</body></html>';
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/products' && method === 'GET') {
    const list = await readProducts(env);
    return json({ ok: true, products: list.map(p => ({
      id: p.id, name: p.name, slug: p.slug, price: p.price, wasPrice: p.wasPrice,
      category: p.category, categoryName: p.categoryName, images: p.images || [],
    })) });
  }
/* ---------- checkout API (public) ---------- */
  if (path === '/api/pay/ping' && method === 'GET') {
    return json({ ok: true, ready: paypalReady(env), env: paypalEnv(env), currency: CURRENCY });
  }

  if (path === '/api/pay/create' && method === 'POST') {
    if (!paypalReady(env)) return json({ ok: false, error: 'Card payment is not switched on yet - please order by email.' }, 503);
    const body = await request.json().catch(() => ({}));
    const lines = cartLines(body.items);
    if (!lines.length) return json({ ok: false, error: 'Your cart is empty.' }, 400);
    const total = linesTotal(lines);
    const unit = {
      reference_id: 'latexpapa',
      description: 'LatexPapa made-to-measure order',
      items: lines.map(l => ({
        name: l.name, sku: l.slug, quantity: String(l.qty),
        unit_amount: { currency_code: CURRENCY, value: l.price.toFixed(2) },
        category: 'PHYSICAL_GOODS',
      })),
      amount: {
        currency_code: CURRENCY, value: total.toFixed(2),
        breakdown: { item_total: { currency_code: CURRENCY, value: total.toFixed(2) } },
      },
    };
    const note = String(body.note || '').trim().slice(0, 120);
    if (note) unit.custom_id = note;
    let created;
    try {
      created = await paypalFetch(env, '/v2/checkout/orders', 'POST', {
        intent: 'CAPTURE',
        purchase_units: [unit],
        application_context: {
          brand_name: 'LatexPapa',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          shipping_preference: 'GET_FROM_FILE',
          return_url: url.origin + '/checkout/',
          cancel_url: url.origin + '/checkout/',
        },
      }, { 'PayPal-Request-Id': 'lp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) });
    } catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
    const links = Array.isArray(created.links) ? created.links : [];
    const approve = links.find(l => l.rel === 'approve' || l.rel === 'payer-action');
    if (!created.id || !approve) return json({ ok: false, error: 'PayPal did not return an approval link.' }, 502);
    // Record the attempt straight away so an order is never lost if the buyer
    // closes the tab before PayPal sends them back to us.
    try {
      await upsertOrder(env, created.id, {
        ref: orderRef(created.id),
        total, currency: CURRENCY,
        items: lines.map(l => ({ sku: l.slug, name: l.name, qty: l.qty, price: l.price })),
        note: note || '',
      }, 'checkout started');
    } catch (e) {}
    return json({ ok: true, id: created.id, approvalUrl: approve.href, total, currency: CURRENCY, env: paypalEnv(env) });
  }

  if (path === '/api/pay/capture' && method === 'POST') {
    if (!paypalReady(env)) return json({ ok: false, error: 'Card payment is not switched on yet.' }, 503);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || '').slice(0, 80);
    if (!id) return json({ ok: false, error: 'Missing order id.' }, 400);
    let cap;
    try {
      cap = await paypalFetch(env, '/v2/checkout/orders/' + encodeURIComponent(id) + '/capture', 'POST', {});
    } catch (e) {
      const msg = String(e.message || e);
      if (/ORDER_ALREADY_CAPTURED/.test(msg)) {
        const saved = (await readOrders(env)).find(o => o.paypalId === id);
        if (saved) return json({ ok: true, ref: saved.ref, status: saved.status, total: saved.total, currency: saved.currency, repeat: true });
      }
      return json({ ok: false, error: msg }, 502);
    }
    if (cap.status !== 'COMPLETED') return json({ ok: false, error: 'Payment not completed (' + cap.status + ').' }, 409);
    const pu = (Array.isArray(cap.purchase_units) && cap.purchase_units[0]) || {};
    const caps = (pu.payments && Array.isArray(pu.payments.captures) && pu.payments.captures[0]) || null;
    const amount = (caps && caps.amount) || pu.amount || {};
    // Pull the full order so the dashboard gets the buyer email and the
    // shipping address PayPal collected at checkout.
    let full = cap;
    try { full = await paypalFetch(env, '/v2/checkout/orders/' + encodeURIComponent(id), 'GET'); } catch (e) {}
    const fullPu = (Array.isArray(full.purchase_units) && full.purchase_units[0]) || pu;
    const cust = customerOf(full);
    const ship = shippingOf(full);
    const rec = await upsertOrder(env, id, {
      status: 'paid',
      captureId: (caps && caps.id) || '',
      total: Number(amount.value || 0), currency: amount.currency_code || CURRENCY,
      payer: cust.email || (cap.payer && (cap.payer.email_address || cap.payer.payer_id)) || '',
      customer: cust, shipping: ship,
      paidAt: new Date().toISOString(),
      items: (Array.isArray(fullPu.items) && fullPu.items.length ? fullPu.items : (Array.isArray(pu.items) ? pu.items : [])).map(i => ({
        sku: i.sku, name: i.name, qty: Number(i.quantity || 1),
        price: Number((i.unit_amount && i.unit_amount.value) || 0),
      })),
    }, 'payment captured');
    const nres = await notifyOrder(env, rec);
    await saveNotify(env, rec, nres);
    return json({ ok: true, ref: rec.ref, status: cap.status, total: rec.total, currency: rec.currency });
  }

  if (path === '/api/pay/order' && method === 'GET') {
    const id = String(url.searchParams.get('id') || '').slice(0, 80);
    if (!id) return json({ ok: false, error: 'Missing order id.' }, 400);
    const saved = (await readOrders(env)).find(o => o.paypalId === id);
    if (saved) return json({ ok: true, status: saved.status, ref: saved.ref, total: saved.total, currency: saved.currency, saved: true });
    if (!paypalReady(env)) return json({ ok: false, error: 'Card payment is not switched on yet.' }, 503);
    let ord;
    try { ord = await paypalFetch(env, '/v2/checkout/orders/' + encodeURIComponent(id)); }
    catch (e) { return json({ ok: false, error: String(e.message || e) }, 502); }
    const pu = (Array.isArray(ord.purchase_units) && ord.purchase_units[0]) || {};
    return json({
      ok: true, status: ord.status, ref: orderRef(id),
      total: Number((pu.amount && pu.amount.value) || 0),
      currency: (pu.amount && pu.amount.currency_code) || CURRENCY,
    });
  }

/* ---------- order dashboard (admin only) ---------- */
  if (path === '/api/orders' && method === 'GET') {
    if (!(await isAuthed(request, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
    const orders = (await readOrders(env)).map(publicOrder);
    return json({ ok: true, orders, paypal: paypalReady(env), env: paypalEnv(env), notify: notifyChannel(env), notifyLabel: notifyLabel(env) });
  }

  if (path === '/api/notify-test' && method === 'POST') {
    if (!(await isAuthed(request, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
    const chan = notifyChannel(env);
    if (!chan) return json({ ok: false, channel: '', label: notifyLabel(env), error: 'No alert channel is set up yet.' });
    const res = await notifyOrder(env, {
      ref: 'TEST-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      items: [{ name: 'Test alert - this is not a real order', qty: 1, price: 199 }],
      total: 199, currency: CURRENCY,
      customer: { name: 'LatexPapa dashboard', email: env.NOTIFY_EMAIL || '' },
      shipping: { address: 'Test only' },
      note: 'If you can read this, new-order alerts are working.',
    });
    return json({ ok: !!res.ok, channel: chan, label: notifyLabel(env), status: res.status || 0, error: res.error || '', email: res.email || null });
  }

  if (path === '/api/order' && method === 'POST') {
    if (!(await isAuthed(request, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
    const body = await request.json().catch(() => ({}));
    const key = String(body.id || '');
    if (!key) return json({ ok: false, error: 'Missing order id.' }, 400);
    const list = await readOrders(env);
    const at = list.findIndex(o => o.id === key || o.paypalId === key);
    if (at < 0) return json({ ok: false, error: 'Order not found.' }, 404);
    const rec = list[at];
    const now = new Date().toISOString();
    if (body.remove === true) {
      list.splice(at, 1);
      await writeOrders(env, list);
      return json({ ok: true, removed: true });
    }
    if (typeof body.status === 'string' && ORDER_STATUSES.indexOf(body.status) >= 0 && body.status !== rec.status) {
      rec.status = body.status;
      if (body.status === 'shipped') rec.shippedAt = now;
      if (body.status === 'paid') rec.paidAt = rec.paidAt || now;
      rec.timeline = rec.timeline || [];
      rec.timeline.push({ at: now, event: 'marked ' + body.status });
    }
    for (const k of ['carrier', 'tracking']) {
      if (typeof body[k] === 'string') rec[k] = body[k].trim().slice(0, 120);
    }
    if (typeof body.note === 'string') rec.note = body.note.slice(0, 2000);
    if (typeof body.shipTo === 'string') rec.shipping = { name: (rec.shipping && rec.shipping.name) || '', address: body.shipTo.slice(0, 400) };
    rec.updatedAt = now;
    await writeOrders(env, list);
    return json({ ok: true, order: publicOrder(rec) });
  }

  if (path === '/api/orders/sync' && method === 'POST') {
    if (!(await isAuthed(request, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
    if (!paypalReady(env)) return json({ ok: false, error: 'PayPal is not configured on this site yet.' }, 503);
    const list = await readOrders(env);
    let checked = 0, changed = 0, failed = 0;
    for (const rec of list) {
      if (!rec.paypalId) continue;
      if (rec.status === 'shipped' || rec.status === 'cancelled' || rec.status === 'refunded') continue;
      if (checked >= 40) break;
      checked++;
      try {
        const ord = await paypalFetch(env, '/v2/checkout/orders/' + encodeURIComponent(rec.paypalId), 'GET');
        const cust = customerOf(ord);
        const ship = shippingOf(ord);
        if (cust.email && cust.email !== rec.payer) { rec.payer = cust.email; changed++; }
        if (cust.name || ship.address) {
          if (!rec.customer || !rec.customer.name) { rec.customer = cust; changed++; }
          if (!rec.shipping || !rec.shipping.address) { rec.shipping = ship; changed++; }
        }
        if (ord.status === 'COMPLETED' && rec.status !== 'paid') {
          rec.status = 'paid';
          rec.paidAt = rec.paidAt || new Date().toISOString();
          rec.timeline = rec.timeline || [];
          rec.timeline.push({ at: new Date().toISOString(), event: 'paypal says COMPLETED' });
          changed++;
        } else if (ord.status && /VOIDED|CANCEL/i.test(ord.status) && rec.status === 'awaiting') {
          rec.status = 'cancelled';
          changed++;
        }
      } catch (e) { failed++; }
    }
    if (changed) await writeOrders(env, list);
    return json({ ok: true, checked, changed, failed });
  }

  if (path === '/api/orders.csv' && method === 'GET') {
    if (!(await isAuthed(request, env))) return json({ ok: false, error: 'Not signed in.' }, 401);
    const orders = await readOrders(env);
    const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
    const head = ['Reference', 'Placed', 'Status', 'Customer', 'Email', 'Ship to', 'Items', 'Total', 'Currency', 'Carrier', 'Tracking', 'Customer note', 'PayPal order id'];
    const rows = orders.map(o => {
      const po = publicOrder(o);
      return [
        po.ref, po.created, po.status, po.customer.name, po.customer.email || po.payer,
        po.shipping.address, po.items.map(i => i.name + ' x' + i.qty).join('; '),
        Number(po.total).toFixed(2), po.currency, po.carrier, po.tracking, po.note, po.paypalId,
      ].map(cell).join(',');
    });
    const csv = '\ufeff' + head.map(cell).join(',') + '\r\n' + rows.join('\r\n') + '\r\n';
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="latexpapa-orders.csv"',
        'cache-control': 'no-store',
      },
    });
  }

  if (path === '/api/session' && method === 'GET') {
    return json({ ok: true, authed: await isAuthed(request, env) });
  }
  if (path === '/api/login' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'Admin password not configured yet.' }, 500);
    if (!safeEqual(body.password || '', env.ADMIN_PASSWORD)) return json({ ok: false, error: 'Wrong password.' }, 401);
    const token = await newSession(env);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'set-cookie': COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600',
      },
    });
  }
  if (path === '/api/logout' && method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json', 'set-cookie': COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' },
    });
  }

  const authed = await isAuthed(request, env);

  if (path === '/api/list' && method === 'GET') {
    if (!authed) return json({ ok: false, error: 'Not signed in.' }, 401);
    return json({ ok: true, products: await readProducts(env) });
  }
  if (path === '/api/save' && method === 'POST') {
    if (!authed) return json({ ok: false, error: 'Not signed in.' }, 401);
    const p = await request.json().catch(() => null);
    if (!p || !p.name) return json({ ok: false, error: 'Please give the product a name.' }, 400);
    const list = await readProducts(env);
    if (!p.id) p.id = 'kv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!p.slug) p.slug = slugify(p.name) || p.id;
    p.updatedAt = new Date().toISOString();
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) list[i] = p; else list.push(p);
    await env.LATEXPAPA_DATA.put('products', JSON.stringify(list));
    return json({ ok: true, product: p });
  }
  if (path === '/api/delete' && method === 'POST') {
    if (!authed) return json({ ok: false, error: 'Not signed in.' }, 401);
    const body = await request.json().catch(() => ({}));
    const list = await readProducts(env);
    const next = list.filter(x => x.id !== body.id);
    await env.LATEXPAPA_DATA.put('products', JSON.stringify(next));
    return json({ ok: true, removed: list.length - next.length });
  }
  if (path === '/api/upload' && method === 'POST') {
    if (!authed) return json({ ok: false, error: 'Not signed in.' }, 401);
    const form = await request.formData().catch(() => null);
    if (!form) return json({ ok: false, error: 'Expected a file upload.' }, 400);
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ ok: false, error: 'No file received.' }, 400);
    if (file.size > 6291456) return json({ ok: false, error: 'That image is bigger than 6 MB.' }, 413);
    const ext = ((file.name || 'x.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const key = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.' + ext;
    await env.LATEXPAPA_DATA.put('img:' + key, await file.arrayBuffer(), { metadata: { type: file.type || 'image/jpeg' } });
    return json({ ok: true, url: '/api/img/' + key });
  }
  if (path.startsWith('/api/img/') && method === 'GET') {
    const key = decodeURIComponent(path.slice(9));
    const obj = await env.LATEXPAPA_DATA.getWithMetadata('img:' + key, { type: 'arrayBuffer' });
    if (!obj || !obj.value) return new Response('Not found', { status: 404 });
    return new Response(obj.value, {
      headers: {
        'content-type': (obj.metadata && obj.metadata.type) || 'image/jpeg',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  }
  return json({ ok: false, error: 'Unknown endpoint.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // Canonical host: the shop is only ever served from https://www.latexpapa.com.
      // The bare domain and the pages.dev preview host both 301 into it, so Google
      // only ever sees one URL per page (no “duplicate / alternate page” split).
      if (url.hostname === 'latexpapa.com' || url.hostname === 'latexpapa.pages.dev') {
        return Response.redirect('https://www.latexpapa.com' + url.pathname + url.search, 301);
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (url.pathname.startsWith('/product/')) {
        const res = await env.ASSETS.fetch(request);
        if (res.status !== 404) return res;
        const slug = decodeURIComponent(url.pathname.replace(/^\/product\//, '').replace(/\/$/, ''));
        const list = await readProducts(env);
        const p = list.find(x => x.slug === slug || x.id === slug);
        if (!p) return res;
        return new Response(productPage(p, url.origin), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
        });
      }
      return await env.ASSETS.fetch(request);
    } catch (err) {
      try { return await env.ASSETS.fetch(request); }
      catch (e) { return new Response('Error: ' + String(err), { status: 500 }); }
    }
  },
};