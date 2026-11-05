/* LatexPapa product search.
   Header overlay + the /search/ results page.
   Index: /search-index.json (written by site/build.mjs) merged with /api/products
   so pieces added later through /admin/ are searchable too. */
(function () {
  "use strict";

  var MENU_MAX = 8;
  var indexPromise = null;

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function prep(o) {
    var name = String((o && o.n) || "");
    var cat = String((o && o.c) || "");
    var slug = String((o && o.s) || "");
    var price = Number((o && o.p) || 0);
    return {
      s: slug,
      n: name,
      c: cat,
      p: price,
      i: (o && o.i) || "",
      hn: norm(name),
      h: norm(name + " " + cat + " " + slug.replace(/-/g, " ") + " " + String((o && o.k) || "") + " " + price)
    };
  }

  function load() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch("/search-index.json", { cache: "force-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        var idx = (Array.isArray(list) ? list : []).map(prep);
        return fetch("/api/products", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; })
          .then(function (d) {
            if (d && d.ok && d.products && d.products.length) {
              var seen = Object.create(null);
              for (var i = 0; i < idx.length; i++) seen[idx[i].s] = 1;
              for (var j = 0; j < d.products.length; j++) {
                var p = d.products[j];
                if (!p || !p.slug || seen[p.slug]) continue;
                seen[p.slug] = 1;
                idx.push(prep({ s: p.slug, n: p.name, c: p.categoryName, p: p.price, i: (p.images && p.images[0]) || "", k: ((p.options || {}).Color || []).join(" ") }));
              }
            }
            return idx;
          });
      });
    return indexPromise;
  }

  function hasWord(hay, t) {
    if (!t) return true;
    if (hay.indexOf(t) > -1) return true;
    if (t.length > 3 && t.charAt(t.length - 1) === "s" && hay.indexOf(t.slice(0, -1)) > -1) return true;
    if (hay.indexOf(t + "s") > -1) return true;
    return false;
  }

  function search(idx, q) {
    var ts = norm(q).split(" ").filter(Boolean);
    if (!ts.length) return [];
    var phrase = ts.join(" ");
    var scored = [];
    for (var i = 0; i < idx.length; i++) {
      var it = idx[i];
      var ok = true, score = 0;
      for (var k = 0; k < ts.length; k++) {
        if (!hasWord(it.h, ts[k])) { ok = false; break; }
        if (hasWord(it.hn, ts[k])) score += 4;
        if (it.hn.indexOf(ts[k]) === 0) score += 2;
      }
      if (!ok) continue;
      if (it.hn.indexOf(phrase) === 0) score += 14;
      else if (it.hn.indexOf(phrase) > -1) score += 9;
      if (phrase.length > 3 && it.h.indexOf(phrase) > -1) score += 3;
      scored.push([score, it]);
    }
    scored.sort(function (a, b) { return b[0] - a[0] || a[1].n.localeCompare(b[1].n); });
    var out = [];
    for (var m = 0; m < scored.length; m++) out.push(scored[m][1]);
    return out;
  }

  function money(v) { return "$" + Number(v || 0).toFixed(2); }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function highlight(name, q) {
    var frag = document.createDocumentFragment();
    var ts = norm(q).split(" ").filter(function (t) { return t.length > 1; });
    if (!ts.length) { frag.appendChild(document.createTextNode(name)); return frag; }
    var re = new RegExp("(" + ts.map(escRe).join("|") + ")", "ig");
    var parts = String(name).split(re);
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (i % 2 === 1) {
        var mark = document.createElement("mark");
        mark.textContent = parts[i];
        frag.appendChild(mark);
      } else {
        frag.appendChild(document.createTextNode(parts[i]));
      }
    }
    return frag;
  }

  function row(it, q) {
    var a = document.createElement("a");
    a.className = "lp-r";
    a.href = "/product/" + it.s + "/";
    a.setAttribute("role", "option");
    if (it.i) {
      var im = document.createElement("img");
      im.src = it.i; im.alt = ""; im.loading = "lazy";
      a.appendChild(im);
    } else {
      var ph = document.createElement("span"); ph.className = "lp-r-ph";
      a.appendChild(ph);
    }
    var tx = document.createElement("span"); tx.className = "lp-r-tx";
    var nm = document.createElement("span"); nm.className = "lp-r-nm";
    nm.appendChild(highlight(it.n, q));
    var meta = document.createElement("span"); meta.className = "lp-r-meta";
    meta.textContent = (it.c ? it.c + " \u00b7 " : "") + money(it.p);
    tx.appendChild(nm); tx.appendChild(meta);
    a.appendChild(tx);
    return a;
  }

  function card(it, q) {
    var a = document.createElement("a");
    a.className = "card";
    a.href = "/product/" + it.s + "/";
    var ph = document.createElement("div");
    if (it.i) {
      ph.className = "ph";
      var im = document.createElement("img");
      im.src = it.i; im.alt = it.n + " \u2014 handmade latex, made to measure"; im.loading = "lazy";
      ph.appendChild(im);
    } else {
      ph.className = "ph empty";
      ph.setAttribute("data-label", "Photo coming soon");
    }
    a.appendChild(ph);
    var inn = document.createElement("div"); inn.className = "in";
    var cat = document.createElement("span"); cat.className = "cat"; cat.textContent = it.c || "";
    var nm = document.createElement("span"); nm.className = "nm"; nm.appendChild(highlight(it.n, q));
    var pr = document.createElement("span"); pr.className = "pr"; pr.textContent = money(it.p);
    inn.appendChild(cat); inn.appendChild(nm); inn.appendChild(pr);
    a.appendChild(inn);
    return a;
  }

  function noMatch(q) {
    var span = document.createElement("span");
    span.appendChild(document.createTextNode("No pieces match \u201c" + String(q).trim() + "\u201d. "));
    var a = document.createElement("a");
    a.href = "/contact/"; a.textContent = "Tell us what you need";
    span.appendChild(a);
    span.appendChild(document.createTextNode(" \u2014 anything can be made to order."));
    return span;
  }

  function bind(root, opts) {
    opts = opts || {};
    var input = root.querySelector("input.lp-q");
    var box = root.querySelector("[data-lp-results]");
    if (!input || !box) return null;
    var statusEl = root.querySelector("[data-lp-status]");
    var seeAll = root.querySelector("[data-lp-seeall]");
    var mode = box.getAttribute("data-lp-mode") || opts.mode || "rows";
    var max = mode === "rows" ? (opts.max || MENU_MAX) : 0;
    var last = "";
    var timer = null;

    function setStatus(node) {
      if (!statusEl) return;
      statusEl.textContent = "";
      if (node) statusEl.appendChild(typeof node === "string" ? document.createTextNode(node) : node);
    }

    function clear() {
      box.textContent = "";
      box.hidden = true;
      setStatus("");
      root.classList.remove("has-results");
      if (seeAll) { seeAll.hidden = true; seeAll.removeAttribute("href"); }
    }

    function render(q) {
      last = q;
      if (!norm(q)) { clear(); return; }
      load().then(function (idx) {
        if (q !== last) return;
        var all = search(idx, q);
        box.textContent = "";
        if (!all.length) {
          box.hidden = true;
          root.classList.remove("has-results");
          setStatus(noMatch(q));
          if (seeAll) seeAll.hidden = true;
          return;
        }
        var show = max ? all.slice(0, max) : all;
        box.hidden = false;
        for (var i = 0; i < show.length; i++) box.appendChild(mode === "rows" ? row(show[i], q) : card(show[i], q));
        root.classList.add("has-results");
        setStatus(all.length + (all.length === 1 ? " piece matches" : " pieces match"));
        if (seeAll) {
          if (max && all.length > max) {
            seeAll.hidden = false;
            seeAll.href = "/search/?q=" + encodeURIComponent(String(q).trim());
            seeAll.textContent = "See all " + all.length + " results";
          } else {
            seeAll.hidden = true;
          }
        }
      });
    }

    input.addEventListener("input", function () {
      var q = input.value;
      clearTimeout(timer);
      timer = setTimeout(function () { render(q); }, 110);
    });
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
    input.addEventListener("keydown", function (ev) {
      var items = box.querySelectorAll(".lp-r, .card");
      if (ev.key === "Escape") { input.value = ""; clear(); input.blur(); return; }
      if (!items.length) return;
      var cur = box.querySelector(".lp-r.sel");
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        var at = cur ? Array.prototype.indexOf.call(items, cur) : -1;
        at = ev.key === "ArrowDown" ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
        if (cur) cur.classList.remove("sel");
        items[at].classList.add("sel");
        items[at].scrollIntoView({ block: "nearest" });
      } else if (ev.key === "Enter" && cur) {
        ev.preventDefault();
        location.href = cur.getAttribute("href");
      }
    });

    return { input: input, render: render, clear: clear };
  }

  var components = [];
  var roots = document.querySelectorAll("[data-lp-search]");
  for (var i = 0; i < roots.length; i++) {
    var c = bind(roots[i]);
    if (c) components.push(c);
  }

  var overlay = document.getElementById("lpsearch");
  var openBtn = document.getElementById("searchbtn");
  if (overlay && openBtn) {
    var ovInput = overlay.querySelector("input.lp-q");
    var openSearch = function () {
      overlay.hidden = false;
      void overlay.offsetWidth;
      overlay.classList.add("on");
      openBtn.setAttribute("aria-expanded", "true");
      if (ovInput) { ovInput.value = ""; setTimeout(function () { ovInput.focus(); }, 40); }
    };
    var closeSearch = function () {
      overlay.classList.remove("on");
      overlay.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
    };
    openBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (overlay.hidden) openSearch(); else closeSearch();
    });
    var closeBtn = overlay.querySelector("[data-lp-close]");
    if (closeBtn) closeBtn.addEventListener("click", closeSearch);
    overlay.addEventListener("mousedown", function (ev) { if (ev.target === overlay) closeSearch(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !overlay.hidden) closeSearch();
    });
    document.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "k" || ev.key === "K")) {
        ev.preventDefault();
        if (overlay.hidden) openSearch(); else closeSearch();
      }
    });
  }

  var page = document.querySelector("[data-lp-page]");
  if (page) {
    var q0 = "";
    try { q0 = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
    var pc = null;
    for (var n = 0; n < components.length; n++) {
      if (page.contains(components[n].input)) { pc = components[n]; break; }
    }
    if (pc) {
      if (q0) { pc.input.value = q0; pc.render(q0); }
      pc.input.addEventListener("input", function () {
        var v = pc.input.value;
        var url = v.trim() ? "/search/?q=" + encodeURIComponent(v.trim()) : "/search/";
        try { history.replaceState(null, "", url); } catch (e) {}
      });
    }
  }
})();