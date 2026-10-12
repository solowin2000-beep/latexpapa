(function () {
  var path = location.pathname;
  var isShop = path === "/shop/";
  var isCategory = /^\/latex-[a-z-]+\/$/.test(path);
  var grid = document.querySelector(".grid");
  var wantList = (isShop || isCategory) && grid;
  var totalEls = document.querySelectorAll("[data-total]");
  if (!wantList && !totalEls.length) return;

  fetch("/api/products", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !d.products || !d.products.length) return;

      // keep every "N pieces" figure on the page in sync with /admin/ additions
      if (totalEls.length) {
        var base = parseInt(totalEls[0].textContent, 10) || 0;
        var n = base + d.products.length;
        for (var k = 0; k < totalEls.length; k++) totalEls[k].textContent = String(n);
      }

      if (!wantList) return;
      var slug = path.replace(/^\/|\/$/g, "");
      d.products.forEach(function (p) {
        if (!isShop && slug !== p.category) return;
        if (grid.querySelector('a[href="/product/' + p.slug + '/"]')) return;
        var a = document.createElement("a");
        a.className = "card";
        a.href = "/product/" + p.slug + "/";
        var ph = document.createElement("div");
        var img = (p.images && p.images[0]) || "";
        if (img) {
          ph.className = "ph";
          var im = document.createElement("img");
          im.src = img; im.alt = ""; im.loading = "lazy";
          ph.appendChild(im);
        } else {
          ph.className = "ph empty";
          ph.setAttribute("data-label", "Photo coming soon");
        }
        a.appendChild(ph);
        var inn = document.createElement("div");
        inn.className = "in";
        var c = document.createElement("span");
        c.className = "cat"; c.textContent = p.categoryName || "";
        var nm = document.createElement("span");
        nm.className = "nm"; nm.textContent = p.name;
        var pr = document.createElement("span");
        pr.className = "pr"; pr.textContent = "$" + Number(p.price || 0).toFixed(2);
        inn.appendChild(c); inn.appendChild(nm); inn.appendChild(pr);
        a.appendChild(inn);
        grid.appendChild(a);
      });
    })
    .catch(function () {});
})();
