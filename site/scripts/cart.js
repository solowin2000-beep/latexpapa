/* LatexPapa cart + checkout (client side).
   The numbers shown here are only for display: /api/pay/create recomputes
   every price from the build-time catalogue, so nothing here is trusted. */
(function () {
  var KEY = 'lp_cart';
  var CAT = window.LP_CATALOG || {};
  var MAXQ = 20;

  function money(v) { return '$' + Number(v || 0).toFixed(2); }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var x = arr[i];
        if (!x || typeof x.slug !== 'string' || !x.slug) continue;
        var q = Math.floor(Number(x.qty) || 1);
        if (!(q >= 1)) q = 1;
        if (q > MAXQ) q = MAXQ;
        out.push({ slug: x.slug, qty: q });
      }
      return out;
    } catch (e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
    paint();
  }
  function count() {
    var a = read(), n = 0;
    for (var i = 0; i < a.length; i++) n += a[i].qty;
    return n;
  }
  function add(slug, qty) {
    if (!slug) return;
    var q = Math.floor(Number(qty) || 1);
    if (!(q >= 1)) q = 1;
    if (q > MAXQ) q = MAXQ;
    var arr = read(), hit = null;
    for (var i = 0; i < arr.length; i++) if (arr[i].slug === slug) hit = arr[i];
    if (hit) hit.qty = Math.min(MAXQ, hit.qty + q);
    else arr.push({ slug: slug, qty: q });
    write(arr);
  }
  function setqty(slug, qty) {
    var q = Math.floor(Number(qty) || 0);
    var arr = [];
    var src = read();
    for (var i = 0; i < src.length; i++) if (src[i].slug !== slug) arr.push(src[i]);
    if (q > 0) arr.push({ slug: slug, qty: Math.min(MAXQ, q) });
    write(arr);
  }
  function remove(slug) {
    var src = read(), arr = [];
    for (var i = 0; i < src.length; i++) if (src[i].slug !== slug) arr.push(src[i]);
    write(arr);
  }
  function clear() { write([]); }

  function paint() {
    var n = count();
    var nodes = document.querySelectorAll('[data-cart-count]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = String(n);
      nodes[i].style.display = n > 0 ? '' : 'none';
    }
  }

  function toast(msg) {
    var el = document.getElementById('lp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lp-toast';
      el.className = 'lp-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    if (el._t) clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 2600);
  }

  function renderCart() {
    var root = document.querySelector('[data-cart-lines]');
    var sub = document.querySelector('[data-cart-subtotal]');
    var empty = document.getElementById('cart-empty');
    var body = document.getElementById('cart-body');
    var arr = read();
    var total = 0, html = '';
    for (var i = 0; i < arr.length; i++) {
      var x = arr[i];
      var c = CAT[x.slug] || {};
      var price = Number(c.p || 0);
      total += price * x.qty;
      html += '<div class="cartline">' +
        '<div class="cl-in">' +
        (c.img ? '<img src="' + c.img + '" alt="" width="72" height="72" loading="lazy">' : '') +
        '<div><a class="cl-nm" href="/product/' + x.slug + '/">' + (c.n || x.slug) + '</a>' +
        '<div class="cl-pr">' + (price ? money(price) + ' each' : 'Price on request') + '</div></div></div>' +
        '<div class="cl-q"><button type="button" data-dec="' + x.slug + '" aria-label="One fewer">&minus;</button>' +
        '<span>' + x.qty + '</span>' +
        '<button type="button" data-inc="' + x.slug + '" aria-label="One more">+</button></div>' +
        '<div class="cl-line">' + (price ? money(price * x.qty) : '—') + '</div>' +
        '<button type="button" class="cl-x" data-rm="' + x.slug + '" aria-label="Remove">&times;</button>' +
        '</div>';
    }
    if (root) root.innerHTML = html;
    var subs = document.querySelectorAll('[data-cart-subtotal]');
    for (var k = 0; k < subs.length; k++) subs[k].textContent = money(total);
    if (empty) empty.style.display = arr.length ? 'none' : '';
    if (body) body.style.display = arr.length ? '' : 'none';
    return arr;
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var hit;
    if ((hit = t.closest('[data-add]'))) {
      ev.preventDefault();
      add(hit.getAttribute('data-add'), hit.getAttribute('data-qty') || 1);
      toast('Added to cart');
      renderCart();
      return;
    }
    if ((hit = t.closest('[data-inc]'))) {
      var a = read(), si = hit.getAttribute('data-inc');
      for (var i = 0; i < a.length; i++) if (a[i].slug === si) a[i].qty = Math.min(MAXQ, a[i].qty + 1);
      write(a); renderCart(); return;
    }
    if ((hit = t.closest('[data-dec]'))) {
      var b = read(), sd = hit.getAttribute('data-dec');
      for (var j = 0; j < b.length; j++) if (b[j].slug === sd) b[j].qty = Math.max(1, b[j].qty - 1);
      write(b); renderCart(); return;
    }
    if ((hit = t.closest('[data-rm]'))) { remove(hit.getAttribute('data-rm')); renderCart(); return; }
  });

  window.LP_CART = { read: read, write: write, add: add, set: setqty, remove: remove, clear: clear, count: count, paint: paint, render: renderCart, toast: toast, money: money };

  function load() {
    paint();
    if (document.querySelector('[data-cart-lines]') || document.getElementById('cart-body')) renderCart();
    if (window.LP_CHECKOUT && typeof initCheckout === 'function') initCheckout();
  }

  function initCheckout() {
    var st = document.getElementById('co-state');
    var linesBox = document.getElementById('co-lines');
    var payBtn = document.getElementById('co-pay');
    function show(html) { if (st) st.innerHTML = html; }

    var params = new URLSearchParams(window.location.search);
    var orderId = params.get('token') || params.get('pp_order') || params.get('order');

    if (orderId) {
      show('<p class="muted">Confirming your payment&hellip;</p>');
      fetch('/api/pay/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: orderId }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) {
            clear(); renderCart();
            if (linesBox) linesBox.style.display = 'none';
            if (payBtn) payBtn.style.display = 'none';
            show('<div class="okbox"><h3 style="margin-bottom:10px">Payment received</h3>' +
              '<p style="margin:0 0 12px">Your order reference is <span class="ref">' + j.ref + '</span> &middot; total ' + money(j.total) + ' ' + (j.currency || 'USD') + '.</p>' +
              '<p style="margin:0 0 8px"><b>Next step:</b> send your measurements and we will start cutting. Nine numbers for a full body piece.</p>' +
              '<p style="margin:0">Email <a href="mailto:latexpapa@latexpapa.com">latexpapa@latexpapa.com</a> or message us on WhatsApp &mdash; quote your reference.</p></div>');
          } else {
            show('<div class="paynotice">' + ((j && j.error) || 'We could not confirm that payment.') +
              '<br><br>If money has left your account, email <a href="mailto:latexpapa@latexpapa.com">latexpapa@latexpapa.com</a> and we will sort it out.</div>');
          }
        })
        .catch(function () {
          show('<div class="paynotice">Network problem while confirming your payment. Refresh this page, or email <a href="mailto:latexpapa@latexpapa.com">latexpapa@latexpapa.com</a>.</div>');
        });
      return;
    }

    var arr = renderCart();
    if (!arr.length) {
      show('<p class="muted">Your cart is empty. <a href="/shop/">Browse the shop</a> and add a piece.</p>');
      if (payBtn) payBtn.style.display = 'none';
      return;
    }
    if (linesBox) linesBox.style.display = '';

    fetch('/api/pay/ping').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ready) {
        show('<p class="muted">You will be taken to PayPal to pay by card, Apple Pay, Google Pay or your PayPal balance. Free worldwide shipping is already included.</p>');
      } else {
        show('<div class="paynotice"><b>Pay by email or WhatsApp.</b><br>Send us the list on this page and we will reply with a payment link and your measurement sheet.</div>');
        if (payBtn) payBtn.style.display = 'none';
      }
    }).catch(function () { show('<p class="muted">Ready to pay.</p>'); });

    if (payBtn) payBtn.addEventListener('click', function () {
      if (payBtn.disabled) return;
      payBtn.disabled = true;
      payBtn.textContent = 'Opening PayPal…';
      fetch('/api/pay/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: read() }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.approvalUrl) { window.location.href = j.approvalUrl; return; }
          payBtn.disabled = false; payBtn.textContent = 'Pay with PayPal';
          toast((j && j.error) || 'We could not start the payment.');
        })
        .catch(function () {
          payBtn.disabled = false; payBtn.textContent = 'Pay with PayPal';
          toast('Network problem. Please try again.');
        });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();