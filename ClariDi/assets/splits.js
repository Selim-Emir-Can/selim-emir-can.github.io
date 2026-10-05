/* ClariDi spatial-split viewer: per sample, which tiles are train / val / test in each fold. */
(function () {
  "use strict";
  const D = window.CLARIDI, N = 5;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NS = "http://www.w3.org/2000/svg";
  const PC = { test: "#D55E00", val: "#F0E442", train: "#0072B2" };
  const BC = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#CC79A7"];
  const valBand = k => (k + 1 < N ? k + 1 : k - 1);
  const part = (b, k) => (b === k ? "test" : b === valBand(k) ? "val" : "train");
  const S = { view: "all", scale: "10x10", mod: "csf", units: true, op: 45, spec: "" };

  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  // controls
  const vEl = $("#view");
  [["all", "all folds"], ...[0, 1, 2, 3, 4].map(k => [String(k), "fold " + k]), ["bands", "bands"]].forEach(([v, t]) => {
    const b = document.createElement("button"); b.dataset.v = v; b.textContent = t;
    b.title = v === "all" ? "one map per fold, side by side" : v === "bands" ? "colour = band = the fold in which the tile is tested" : `train / val / test in fold ${v}`;
    vEl.appendChild(b);
  });
  const seg = (id, key) => $("#" + id).addEventListener("click", e => { const b = e.target.closest("button"); if (b) { S[key] = b.dataset.v; render(); } });
  seg("view", "view"); seg("scale", "scale"); seg("mod", "mod");
  $("#units").onchange = e => { S.units = e.target.checked; render(); };
  $("#op").oninput = e => { S.op = +e.target.value; restyle(); };
  [...new Set(D.frames.map(f => f.spec))].sort().forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = `${s} (${D.frames.find(f => f.spec === s).tis})`; $("#spec").appendChild(o); });
  $("#spec").onchange = e => { S.spec = e.target.value; render(); };
  document.addEventListener("keydown", e => {
    if ((e.target.matches && e.target.matches("input[type=text], select")) || e.ctrlKey || e.metaKey || e.altKey) return;
    if ("01234".includes(e.key) && e.key.length === 1) S.view = e.key;
    else if (e.key === "a") S.view = "all";
    else if (e.key === "b") S.view = "bands";
    else if (e.key === "s") S.scale = S.scale === "10x10" ? "5x5" : "10x10";
    else if (e.key === "c") S.mod = S.mod === "csf" ? "ua" : "csf";
    else if (e.key === "u") S.units = !S.units;
    else return;
    render();
  });

  // tooltip
  const tip = $("#tip");
  function showTip(e, t) {
    tip.innerHTML = `<b class="id">${esc(t.id)}</b><br>unit ${esc(t.u)} · band ${t.fold} · ${esc(t.sc)}${t.m ? ' · <span class="badge masked">masked</span>' : ""}` +
      `<div class="roles">${[0, 1, 2, 3, 4].map(k => { const p = part(t.fold, k); return `<span style="background:${PC[p]};${p === "train" ? "color:#fff" : ""}">f${k} ${p}</span>`; }).join("")}</div>` +
      `<img src="img/ua/${t.id}.jpg" alt=""><img src="img/csf/${t.id}.jpg" alt="">`;
    tip.style.display = "block";
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }

  // unit boundary segments for one frame/scale (between grid neighbours of different units, and against empty cells)
  function unitPath(ts) {
    const key = (r, c) => r + "," + c, at = new Map(ts.map(t => [key(t.row, t.col), t]));
    let d = "";
    for (const t of ts) {
      const x0 = t.lx, y0 = t.ly, x1 = t.lx + t.w, y1 = t.ly + t.h;
      const nb = [[t.row, t.col + 1, `M${x1} ${y0}V${y1}`], [t.row + 1, t.col, `M${x0} ${y1}H${x1}`], [t.row, t.col - 1, `M${x0} ${y0}V${y1}`], [t.row - 1, t.col, `M${x0} ${y0}H${x1}`]];
      for (const [r, c, seg] of nb) { const o = at.get(key(r, c)); if (!o || o.u !== t.u) d += seg; }
    }
    return d;
  }

  let rects = [];
  function map(F, ts, k, hatchId) {
    const x0 = Math.min(...ts.map(t => t.x)), y0 = Math.min(...ts.map(t => t.y));
    const x1 = Math.max(...ts.map(t => t.x + t.w)), y1 = Math.max(...ts.map(t => t.y + t.h));
    const svg = el("svg", { class: "mos", viewBox: `0 0 ${F.W} ${F.H}`, preserveAspectRatio: "xMidYMid meet" });
    el("rect", { x: 0, y: 0, width: F.W, height: F.H, fill: `url(#${hatchId})` }, svg);
    el("image", { href: `img/split/${F.id}_${S.scale}_${S.mod}.jpg`, x: x0 - F.x0, y: y0 - F.y0, width: x1 - x0, height: y1 - y0, preserveAspectRatio: "none" }, svg);
    const g = el("g", {}, svg);
    for (const t of ts) {
      const col = k === "bands" ? BC[t.fold] : PC[part(t.fold, +k)];
      const r = el("rect", { class: "t", x: t.lx, y: t.ly, width: t.w, height: t.h, stroke: col }, g);
      r._col = col; rects.push(r);
      r.addEventListener("mousemove", e => showTip(e, t));
      r.addEventListener("mouseleave", () => { tip.style.display = "none"; });
      r.addEventListener("click", () => { location.href = "tiles.html#tile=" + encodeURIComponent(t.id); });
      if (t.m) el("text", { x: t.lx + t.w * 0.06, y: t.ly + t.h * 0.3, "font-size": t.h * 0.26, fill: "#fff", "font-weight": 700, "pointer-events": "none", "font-family": "sans-serif" }, g).textContent = "M";
    }
    if (S.units) el("path", { class: "unit", d: unitPath(ts) }, svg);
    return svg;
  }
  function restyle() {
    for (const r of rects) { r.setAttribute("fill", r._col); r.setAttribute("fill-opacity", S.op / 100); r.style.stroke = r._col; }
  }

  function legend() {
    const L = $("#legend");
    const items = S.view === "bands" ? BC.map((c, i) => [c, `band ${i} = test in fold ${i}`])
      : [[PC.test, "test"], [PC.val, "val"], [PC.train, "train"]];
    L.innerHTML = items.map(([c, t]) => `<span><span class="sw" style="background:${c}"></span>${t}</span>`).join("") +
      `<span><span class="sw" style="background:#1c1c1f repeating-linear-gradient(45deg,#66666c 0 2px,transparent 2px 6px)"></span>no tile</span>` +
      `<span><b>M</b> masked crop</span>${S.units ? "<span>white lines = spatial units</span>" : ""}`;
  }

  function render() {
    document.querySelectorAll(".seg button").forEach(b => { const k = b.parentElement.id; b.classList.toggle("on", String(S[k]) === b.dataset.v); });
    $("#units").checked = S.units; $("#cUnits").classList.toggle("on", S.units);
    legend();
    rects = [];
    const box = $("#cards"); box.innerHTML = "";
    const all = S.view === "all";
    box.style.setProperty("--cw", all ? "100%" : "400px");
    D.frames.filter(F => !S.spec || F.spec === S.spec).forEach(F => {
      const ts = D.tiles.filter(t => t.fr === F.id && t.sc === S.scale).map(t => Object.assign(t, { lx: t.x - F.x0, ly: t.y - F.y0 }));
      if (!ts.length) return;
      const c = document.createElement("div"); c.className = "card frame";
      const hid = "h_" + F.id;
      c.innerHTML = `<h3><span>${esc(F.label)} <small>${esc(F.tis)} · frame ${esc(F.id)}</small></span><small>${ts.length} tiles at ${S.scale} · ${new Set(ts.map(t => t.u)).size} units</small></h3>` +
        `<svg width="0" height="0" style="position:absolute"><defs><pattern id="${hid}" patternUnits="userSpaceOnUse" width="${F.W / 50}" height="${F.W / 50}" patternTransform="rotate(45)">` +
        `<rect width="${F.W / 50}" height="${F.W / 50}" fill="#1c1c1f"/><rect width="${F.W / 160}" height="${F.W / 50}" fill="#5a5a60"/></pattern></defs></svg><div class="maps"></div>`;
      const maps = c.querySelector(".maps");
      const folds = all ? [0, 1, 2, 3, 4] : [S.view];
      maps.style.gridTemplateColumns = `repeat(${all ? 5 : 1}, minmax(0, 1fr))`;
      folds.forEach(k => {
        const m = document.createElement("div"); m.className = "map";
        if (all) m.innerHTML = `<div class="cap">fold ${k}</div>`;
        m.appendChild(map(F, ts, String(k), hid));
        if (k !== "bands") {
          const n = { test: 0, val: 0, train: 0 }; ts.forEach(t => n[part(t.fold, +k)]++);
          const cnt = document.createElement("div"); cnt.className = "cnt";
          cnt.textContent = `test ${n.test} · val ${n.val} · train ${n.train}`; m.appendChild(cnt);
        } else {
          const cnt = document.createElement("div"); cnt.className = "cnt";
          cnt.textContent = [0, 1, 2, 3, 4].map(b => `b${b}: ${ts.filter(t => t.fold === b).length}`).join(" · "); m.appendChild(cnt);
        }
        maps.appendChild(m);
      });
      box.appendChild(c);
    });
    restyle();
    table();
  }

  function table() {
    const ts = D.tiles.filter(t => !S.spec || t.spec === S.spec);
    let h = `<tr><th>fold</th><th>test band</th><th>val band</th><th>test</th><th>val</th><th>train</th><th>test brain / heart</th><th>test 10&times;10 / 5&times;5</th></tr>`;
    for (let k = 0; k < N; k++) {
      const c = { test: 0, val: 0, train: 0 }; ts.forEach(t => c[part(t.fold, k)]++);
      const te = ts.filter(t => t.fold === k);
      h += `<tr><td>${k}</td><td>${k}</td><td>${valBand(k)}</td><td>${c.test}</td><td>${c.val}</td><td>${c.train}</td>` +
        `<td>${te.filter(t => t.tis === "brain").length} / ${te.filter(t => t.tis === "heart").length}</td>` +
        `<td>${te.filter(t => t.sc === "10x10").length} / ${te.filter(t => t.sc === "5x5").length}</td></tr>`;
    }
    $("#tab").innerHTML = h;
  }

  render();
})();
