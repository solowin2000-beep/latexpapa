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