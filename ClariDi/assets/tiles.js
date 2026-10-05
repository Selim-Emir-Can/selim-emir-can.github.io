/* ClariDi tile viewer. Data: window.CLARIDI (data/claridi_data.js). Verdicts: localStorage + JSON export. */
(function () {
  "use strict";
  const D = window.CLARIDI;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MODELS = D.models, MB = Object.fromEntries(MODELS.map(m => [m.slug, m]));
  const VERD = { 1: "good", 2: "acceptable", 3: "bad" };
  const KEY = "claridi_review_v1", PREF = "claridi_tiles_prefs_v2";

  // ---------------------------------------------------------------- state
  const S = { draw: 0, ngen: 5, size: 180, blind: false, showLp: false, models: MODELS.map(m => m.slug) };
  try { Object.assign(S, JSON.parse(localStorage.getItem(PREF) || "{}")); } catch (e) {}
  let R = { reviewer: "", verdicts: {}, notes: {} };
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r) R = Object.assign(R, r); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} };
  const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(S)); } catch (e) {} };

  const tiles = D.tiles.slice();
  const frameOrder = Object.fromEntries(D.frames.map((f, i) => [f.id, i]));
  let view = [], cur = 0, focus = 0;

  function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
  function shuffled(arr, seed) {
    let h = hash(seed);
    return arr.map(x => [((h = (h * 1103515245 + 12345) | 0) >>> 0), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }
  const shown = t => S.blind ? shuffled(S.models.slice(), t.id) : MODELS.map(m => m.slug).filter(s => S.models.includes(s));
  const v = (t, s) => ((R.verdicts[t.id] || {})[s]) || 0;
  const done = t => S.models.length > 0 && S.models.every(s => v(t, s));
  const partly = t => S.models.some(s => v(t, s));
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const drawOf = (slug) => MB[slug].draws.includes(S.draw) ? S.draw : MB[slug].draws[0];
  const src = {
    ua: t => `img/ua/${t.id}.jpg`, csf: t => `img/csf/${t.id}.jpg`,
    vs: (t, s, k) => `img/vs/${s}/${t.id}_${k}.jpg`,
  };

  // ---------------------------------------------------------------- controls
  const specs = [...new Set(tiles.map(t => t.spec))].sort();
  specs.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = `${s} (${tiles.find(t => t.spec === s).tis})`; $("#fSpec").appendChild(o); });
  const drawSeg = $("#draw");
  [0, 1, 2, 3, 4].forEach(k => { const b = document.createElement("button"); b.dataset.v = k; b.textContent = k; b.title = `draw ${k} (seed ${D.seeds[k]})`; drawSeg.appendChild(b); });
  drawSeg.onclick = e => { const b = e.target.closest("button"); if (!b || S.ngen > 1) return; S.draw = +b.dataset.v; savePrefs(); show(); };
  const genSeg = $("#ngen");
  [1, 2, 3, 4, 5].forEach(k => { const b = document.createElement("button"); b.dataset.v = k; b.textContent = k; b.title = k === 1 ? "one draw per model, side by side (choose it with 'draw')" : `draws 0-${k - 1} of every model, one row per model`; genSeg.appendChild(b); });
  genSeg.onclick = e => { const b = e.target.closest("button"); if (!b) return; S.ngen = +b.dataset.v; savePrefs(); show(); };
  const mBox = $("#models");
  MODELS.forEach(m => {
    const l = document.createElement("label"); l.className = "chip"; l.dataset.slug = m.slug;
    l.innerHTML = `<input type="checkbox" value="${m.slug}">${esc(m.short)}`;
    l.querySelector("input").onchange = e => {
      S.models = MODELS.map(x => x.slug).filter(s => s === m.slug ? e.target.checked : S.models.includes(s));
      savePrefs(); focus = 0; show();
    };
    mBox.appendChild(l);
  });
  $("#size").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.size = +b.dataset.v; savePrefs(); show(); };
  $("#blind").onchange = e => { S.blind = e.target.checked; savePrefs(); focus = 0; show(); };
  $("#showLp").onchange = e => { S.showLp = e.target.checked; savePrefs(); show(); };
  $("#reviewer").value = R.reviewer || "";
  $("#reviewer").oninput = e => { R.reviewer = e.target.value; save(); };
  ["fSpec", "fTis", "fSc", "fFold", "fShow", "fSort"].forEach(id => $("#" + id).onchange = () => filter());
  $("#prev").onclick = () => step(-1);
  $("#next").onclick = () => step(1);
  $("#nextSpec").onclick = () => jumpSpec(1);
  $("#note").oninput = e => {
    const t = view[cur]; if (!t) return;
    if (e.target.value.trim()) R.notes[t.id] = e.target.value; else delete R.notes[t.id];
    save();
  };

  // ---------------------------------------------------------------- filtering
  function filter(keepId) {
    const id = keepId || (view[cur] && view[cur].id);
    const sp = $("#fSpec").value, ti = $("#fTis").value, sc = $("#fSc").value, fo = $("#fFold").value, sh = $("#fShow").value, so = $("#fSort").value;
    view = tiles.filter(t => (!sp || t.spec === sp) && (!ti || t.tis === ti) && (!sc || t.sc === sc) && (fo === "" || t.fold === +fo) &&
      (!sh || (sh === "done" ? done(t) : sh === "todo" ? !done(t) : t.m)));
    const pos = (a, b) => a.spec.localeCompare(b.spec) || frameOrder[a.fr] - frameOrder[b.fr] || (a.sc === b.sc ? 0 : a.sc === "10x10" ? -1 : 1) || a.row - b.row || a.col - b.col;
    if (so === "fold") view.sort((a, b) => a.fold - b.fold || pos(a, b));
    else if (so === "rand") { const h = Object.fromEntries(view.map(t => [t.id, hash("r" + t.id) >>> 0])); view.sort((a, b) => h[a.id] - h[b.id]); }
    else if (so === "lp") view.sort((a, b) => (b.lp.ours ? mean(b.lp.ours) : 0) - (a.lp.ours ? mean(a.lp.ours) : 0));
    else view.sort(pos);
    const i = view.findIndex(t => t.id === id);
    cur = i >= 0 ? i : 0; focus = 0;
    show();
  }
  function step(d) {
    const n = cur + d;
    if (n >= 0 && n < view.length) { cur = n; focus = 0; show(); window.scrollTo(0, 0); }
  }
  function jumpSpec(d) {
    const c = $("#fSpec").value || (view[cur] || {}).spec;
    const i = specs.indexOf(c), j = i < 0 ? (d > 0 ? 0 : specs.length - 1) : i + d;
    if (j < 0 || j >= specs.length) return;
    $("#fSpec").value = specs[j];
    filter("__none__");
    const k = view.findIndex(t => !done(t));
    if (k >= 0) { cur = k; show(); }
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- rendering
  function fig(srcUrl, nameHtml, right, cls) {
    return `<figure class="${cls || ""}"><div class="imw"><img src="${srcUrl}" alt="" draggable="false"><div class="xh"></div></div>` +
      `<figcaption><span class="nm">${nameHtml}</span>${right ? `<span class="lp">${right}</span>` : ""}</figcaption></figure>`;
  }
  function verdButtons(t, s) {
    const cv = v(t, s);
    return `<div class="verd">${[1, 2, 3].map(k => `<button data-v="${k}" data-s="${s}" class="${cv === k ? "on" : ""}" title="${VERD[k]} (${k})">${VERD[k]}</button>`).join("")}</div>`;
  }
  function show() {
    document.documentElement.style.setProperty("--sz", S.size + "px");
    drawSeg.querySelectorAll("button").forEach(b => { b.classList.toggle("on", S.ngen === 1 && +b.dataset.v === S.draw); b.disabled = S.ngen > 1; });
    genSeg.querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.v === S.ngen));
    $("#size").querySelectorAll("button").forEach(b => b.classList.toggle("on", +b.dataset.v === S.size));
    mBox.querySelectorAll("label").forEach(l => { const on = S.models.includes(l.dataset.slug); l.classList.toggle("on", on); l.querySelector("input").checked = on; });
    $("#blind").checked = S.blind; $("#blindChip").classList.toggle("on", S.blind);
    $("#showLp").checked = S.showLp; $("#lpChip").classList.toggle("on", S.showLp);

    const t = view[cur];
    const nDone = tiles.filter(done).length;
    $("#stat").textContent = `tile ${view.length ? cur + 1 : 0} / ${view.length} · ${nDone} of ${tiles.length} reviewed`;
    strip();
    if (!t) { $("#head").innerHTML = ""; $("#stage").innerHTML = `<div class="empty">No tiles match these filters.</div>`; $("#noteRow").style.display = "none"; return; }
    $("#noteRow").style.display = "";
    try { history.replaceState(null, "", "#tile=" + t.id); } catch (e) {}
    const fr = D.frames.find(f => f.id === t.fr);
    $("#head").innerHTML = `<h1>${esc(t.id)}</h1><span class="meta">specimen <b>${esc(t.spec)}</b>${fr.label !== t.spec ? ` (${esc(fr.label)})` : ""} · ${esc(t.tis)} · ${esc(t.sc)} crop, row ${t.row}, col ${t.col} · ` +
      `<span class="fold-sw" style="background:var(--f${t.fold})"></span> held out in fold ${t.fold}</span>` +
      `${t.m ? ` <span class="badge masked" title="this crop contains a masked-out region">masked</span>` : ""}` +
      ` <a class="small" href="wholesample.html#frame=${t.fr}&scale=${t.sc}&tile=${t.id}">locate in whole sample &rarr;</a>`;

    const order = shown(t);
    if (focus >= order.length) focus = Math.max(0, order.length - 1);
    const lpTxt = (s, k) => (S.showLp && !S.blind && t.lp[s]) ? "LPIPS " + t.lp[s][k].toFixed(3) : "";
    const nameOf = (s, i) => S.blind ? `VS ${i + 1}` : esc(MB[s].name);
    const refs = `<div class="refs frame"><div><div class="colhead">UA</div>${fig(src.ua(t), "UA", "input")}</div>` +
      `<div><div class="colhead">C&amp;SF</div>${fig(src.csf(t), "C&amp;SF", "reference")}</div></div>`;
    let html;
    if (S.ngen === 1) {
      const vs = order.map((s, i) => {
        const k = drawOf(s);
        const right = S.blind ? "" : [lpTxt(s, k), (k !== S.draw ? "draw 0 only" : (MB[s].draws.length > 1 ? "draw " + k : ""))].filter(Boolean).join(" · ");
        return `<div class="vs v${v(t, s)} ${i === focus ? "focus" : ""}" data-i="${i}">${fig(src.vs(t, s, k), nameOf(s, i), right)}${verdButtons(t, s)}</div>`;
      }).join("");
      html = `<div class="stage">${refs}<div><div class="colhead">VS</div><div class="vsgroup group">${vs || '<span class="mute" style="padding:20px">no models selected</span>'}</div></div></div>`;
    } else {
      const rows = order.map((s, i) => {
        const m = MB[s];
        const draws = `<div class="rowrefs">${fig(src.ua(t), "UA", "input", "ref")}${fig(src.csf(t), "C&amp;SF", "reference", "ref")}</div>` +
          m.draws.slice(0, S.ngen).map(k => fig(src.vs(t, s, k), "draw " + k, lpTxt(s, k))).join("");
        const lpMean = S.showLp && !S.blind && t.lp[s] ? `<div class="mute small">mean LPIPS ${mean(t.lp[s]).toFixed(3)}</div>` : "";
        return `<div class="mrow v${v(t, s)} ${i === focus ? "focus" : ""}" data-i="${i}"><div class="side"><div class="nm">${nameOf(s, i)}</div>` +
          `${lpMean}${verdButtons(t, s)}</div><div class="draws">${draws}</div></div>`;
      }).join("");
      html = `<div class="stage"><div><div class="colhead">UA &nbsp;|&nbsp; C&amp;SF &nbsp;|&nbsp; VS draws 0&ndash;${S.ngen - 1}</div><div class="rowsAll group">${rows || '<span class="mute">no models selected</span>'}</div></div></div>`;
    }
    $("#stage").innerHTML = html;
    $("#note").value = R.notes[t.id] || "";
    // events
    $("#stage").querySelectorAll(".vs,.mrow").forEach(el => el.addEventListener("click", e => {
      const b = e.target.closest(".verd button");
      if (b) { setVerdict(t, b.dataset.s, +b.dataset.v === v(t, b.dataset.s) ? 0 : +b.dataset.v, false); return; }
      focus = +el.dataset.i; show();
    }));
    // preload the neighbours
    [cur + 1, cur - 1].forEach(j => { const n = view[j]; if (!n) return; [src.ua(n), src.csf(n), ...shown(n).map(s => src.vs(n, s, drawOf(s)))].forEach(u => { const im = new Image(); im.src = u; }); });
  }
  function strip() {
    const st = $("#strip");
    if (view.length > 1200) { st.innerHTML = ""; return; }
    st.innerHTML = view.map((t, i) => `<i data-i="${i}" class="${done(t) ? "done" : partly(t) ? "part" : ""}${i === cur ? " cur" : ""}" title="${t.id}"></i>`).join("");
  }
  $("#strip").onclick = e => { const i = e.target.dataset && e.target.dataset.i; if (i != null) { cur = +i; focus = 0; show(); } };

  // synchronized crosshair across all images of the tile
  $("#stage").addEventListener("mousemove", e => {
    const w = e.target.closest(".imw");
    const xs = $("#stage").querySelectorAll(".xh");
    if (!w) { xs.forEach(x => x.style.display = "none"); return; }
    const r = w.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    xs.forEach(x => { x.style.display = "block"; x.style.left = (fx * 100) + "%"; x.style.top = (fy * 100) + "%"; });
  });
  $("#stage").addEventListener("mouseleave", () => $("#stage").querySelectorAll(".xh").forEach(x => x.style.display = "none"));

  function setVerdict(t, s, val, advance) {
    R.verdicts[t.id] = R.verdicts[t.id] || {};
    if (val) R.verdicts[t.id][s] = val; else delete R.verdicts[t.id][s];
    if (!Object.keys(R.verdicts[t.id]).length) delete R.verdicts[t.id];
    R.updated = new Date().toISOString();
    save();
    if (advance && val) {
      const n = shown(t).length;
      if (focus < n - 1) focus++;
      else if ($("#fShow").value === "todo") { const id = t.id; filter(); const i = view.findIndex(x => x.id === id); if (i >= 0) { cur = i; step(1); } return; }
      else { step(1); return; }
    }
    show();
  }

  // ---------------------------------------------------------------- keyboard
  document.addEventListener("keydown", e => {
    if ((e.target.matches && e.target.matches("textarea, input[type=text], select")) || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = view[cur];
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "n") jumpSpec(1);
    else if (e.key === "N") jumpSpec(-1);
    else if (e.key === "ArrowDown") { e.preventDefault(); if (t) { focus = Math.min(shown(t).length - 1, focus + 1); show(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); focus = Math.max(0, focus - 1); show(); }
    else if ("123".includes(e.key) && e.key.length === 1 && t && shown(t).length) setVerdict(t, shown(t)[focus], +e.key, true);
    else if (e.key === "0" && t && shown(t).length) setVerdict(t, shown(t)[focus], 0, false);
    else if (e.key === "d" && S.ngen === 1) { S.draw = (S.draw + 1) % 5; savePrefs(); show(); }
    else if (e.key === "g") { S.ngen = S.ngen === 5 ? 1 : 5; savePrefs(); show(); }
    else if (e.key === "b") { S.blind = !S.blind; savePrefs(); focus = 0; show(); }
  });

  // ---------------------------------------------------------------- export / import
  $("#export").onclick = () => {
    const out = {
      app: "ClariDi tile viewer v1", exported: new Date().toISOString(), reviewer: R.reviewer || "",
      scale: { 1: "good", 2: "acceptable", 3: "bad" },
      models: Object.fromEntries(MODELS.map(m => [m.slug, { experiment: m.exp, name: m.name }])),
      n_tiles_with_verdicts: Object.keys(R.verdicts).length,
      verdicts: Object.fromEntries(Object.entries(R.verdicts).map(([id, o]) => [id, Object.fromEntries(Object.entries(o).map(([s, k]) => [s, VERD[k]]))])),
      notes: R.notes,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    const who = (R.reviewer || "reviewer").replace(/[^A-Za-z0-9_-]+/g, "_");
    a.download = `claridi_verdicts_${who}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  $("#import").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result), inv = { good: 1, acceptable: 2, bad: 3 };
        let n = 0;
        for (const [id, o] of Object.entries(j.verdicts || {})) {
          R.verdicts[id] = R.verdicts[id] || {};
          for (const [s, k] of Object.entries(o)) { const val = typeof k === "number" ? k : inv[k]; if (val && MB[s]) { R.verdicts[id][s] = val; n++; } }
        }
        Object.assign(R.notes, j.notes || {});
        if (!R.reviewer && j.reviewer) R.reviewer = j.reviewer;
        save(); $("#reviewer").value = R.reviewer || ""; show();
        alert(`Imported ${n} verdicts.`);
      } catch (err) { alert("Could not read that file: " + err.message); }
      e.target.value = "";
    };
    rd.readAsText(f);
  };

  // ---------------------------------------------------------------- start
  const m = /tile=([A-Za-z0-9_]+)/.exec(location.hash);
  filter(m ? m[1] : undefined);
})();
