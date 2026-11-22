/* RAG agentique · RGPD — site statique (aucune dépendance) */
"use strict";

const METRIC_LABEL = {
  faithfulness: "Faithfulness",
  answer_relevancy: "Answer relevancy",
  llm_context_precision_with_reference: "Context precision",
  context_recall: "Context recall",
};
const SYS = {
  baseline: { label: "RAG avancé", color: "var(--base)", hex: "#eb6834" },
  agentic: { label: "RAG agentique", color: "var(--agent)", hex: "#2a78d6" },
};
const GOLD_LABEL = { gold_set: "Questions conceptuelles", gold_set2: "Définitions" };
const NS = "http://www.w3.org/2000/svg";

const state = { corpus: [], results: null, gold: "gold_set", q: 0 };
const $ = (s) => document.querySelector(s);
const tip = () => $("#tip");

/* ── utilitaires ─────────────────────────────────────────────── */
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}
function s(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (v, d = 3) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d).replace(".", ","));
const mean = (a) => { const v = a.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
const questions = () => state.results?.gold_sets?.[state.gold] || [];
const allQuestions = () => Object.entries(state.results?.gold_sets || {}).flatMap(([g, qs]) => qs.map((q, i) => ({ g, i, q })));

function showTip(evt, html) {
  const t = tip(); t.innerHTML = html; t.style.display = "block";
  const x = Math.min(evt.clientX + 14, window.innerWidth - t.offsetWidth - 10);
  const y = Math.min(evt.clientY + 14, window.innerHeight - t.offsetHeight - 10);
  t.style.left = x + "px"; t.style.top = y + "px";
}
const hideTip = () => { tip().style.display = "none"; };

function mdLite(text) {
  const lines = esc(text).split(/\r?\n/);
  let out = "", inList = false;
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^\s*#{1,4}\s+/.test(l)) { if (inList) { out += "</ul>"; inList = false; } out += `<h4>${l.replace(/^\s*#+\s+/, "")}</h4>`; }
    else if (/^\s*[-*•]\s+/.test(l)) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`; }
    else if (l.trim()) { if (inList) { out += "</ul>"; inList = false; } out += `<p>${l}</p>`; }
  }
  return out + (inList ? "</ul>" : "");
}
function artTitle(n) { const a = state.corpus.find((x) => x.num === n); return a ? `Article ${n} – ${a.titre}` : `Article ${n}`; }

/* scores moyens sur les questions notées pour LES DEUX systèmes (comparaison appariée) */
function systemMeans(qs) {
  const both = qs.filter((q) => q.systems.baseline && q.systems.agentic);
  const out = {};
  for (const sys of ["baseline", "agentic"]) {
    out[sys] = {};
    for (const m of state.results.metrics) out[sys][m] = mean(both.map((q) => q.systems[sys].scores[m]));
    out[sys].avg = mean(state.results.metrics.map((m) => out[sys][m]));
    out[sys].latency = mean(both.map((q) => q.systems[sys].latency_s));
    out[sys].hit = mean(both.map((q) => q.gold.length ? q.gold.filter((g) => q.systems[sys].articles.includes(g)).length / q.gold.length : null));
  }
  out.n = both.length;
  out.scored = both.filter((q) => q.systems.agentic.scores.faithfulness != null).length;
  return out;
}

/* ── KPI ─────────────────────────────────────────────────────── */
function renderKpis() {
  const all = Object.values(state.results.gold_sets).flat();
  const m = systemMeans(all);
  const box = $("#kpis"); box.innerHTML = "";
  const kpi = (v, l) => box.append(h("div", { class: "kpi", html: `<div class="v">${v}</div><div class="l">${l}</div>` }));
  if (m.scored) {
    const d = m.agentic.avg - m.baseline.avg;
    kpi(`${d >= 0 ? "+" : ""}${fmt(d, 3)}`, `Moyenne RAGAS (4 métriques) : ${fmt(m.baseline.avg, 2)} → ${fmt(m.agentic.avg, 2)}`);
    const dr = m.agentic.context_recall - m.baseline.context_recall;
    kpi(`${dr >= 0 ? "+" : ""}${fmt(dr, 2)}`, "Context recall (agentique − baseline)");
  } else {
    kpi("…", "Notation RAGAS en cours de calcul");
    kpi(`${m.n}<small> / ${all.length}</small>`, "Questions traitées par les deux systèmes");
  }
  kpi(`${Math.round((m.baseline.hit ?? 0) * 100)}\u00a0% → ${Math.round((m.agentic.hit ?? 0) * 100)}\u00a0%`, "Articles attendus retrouvés (baseline → agentique)");
  kpi(`×${m.baseline.latency ? (m.agentic.latency / m.baseline.latency).toFixed(1).replace(".", ",") : "—"}`, "Coût en temps de l'approche agentique");
}

/* ── graphe des agents ───────────────────────────────────────── */
const NODES = {
  question: { x: 320, y: 28, w: 120, h: 34, t: "Question", s: "utilisateur" },
  planner: { x: 320, y: 96, w: 170, h: 46, t: "Planner / Router", s: "route + décompose" },
  off_topic: { x: 96, y: 96, w: 130, h: 46, t: "Hors sujet", s: "réponse polie" },
  researcher: { x: 320, y: 178, w: 170, h: 46, t: "Researcher", s: "outils de recherche" },
  grader: { x: 320, y: 258, w: 170, h: 46, t: "Grader (CRAG)", s: "filtre les articles" },
  rewriter: { x: 548, y: 218, w: 150, h: 46, t: "Rewriter", s: "reformule" },
  writer: { x: 320, y: 336, w: 170, h: 46, t: "Writer", s: "premier jet" },
  critic: { x: 320, y: 420, w: 170, h: 46, t: "Critic", s: "Reflection / Self-RAG" },
  reviser: { x: 548, y: 420, w: 150, h: 46, t: "Reviser", s: "Reflexion" },
  end: { x: 96, y: 420, w: 110, h: 40, t: "Réponse", s: "+ sources" },
};
const EDGES = [
  ["question", "planner"], ["planner", "researcher"], ["planner", "off_topic", "hors RGPD"],
  ["researcher", "grader"], ["grader", "rewriter", "insuffisant"], ["rewriter", "researcher", "", true],
  ["grader", "writer", "suffisant"], ["writer", "critic"], ["critic", "reviser", "à corriger"],
  ["reviser", "critic", "", true], ["critic", "end", "validé"], ["off_topic", "end"],
];
const AGENT_INFO = {
  question: { role: "La question posée en français par l'utilisateur.", dl: { "Exemple": "« Quand une AIPD est-elle obligatoire ? »" } },
  planner: { role: "Décide si la question relève du RGPD, la découpe en 1 à 3 sous-requêtes et propose des articles candidats.",
    dl: { "Sortie": "Plan (route, sous-requêtes, articles)", "Technique": "Query decomposition, routage", "Pourquoi": "Une question transversale (droits, transferts) couvre plusieurs articles." } },
  off_topic: { role: "Répond poliment que la question sort du périmètre du RGPD, sans appeler la recherche.", dl: { "Technique": "Routage conditionnel" } },
  researcher: { role: "Appelle ses outils et fusionne les résultats : recherche vectorielle + BM25 (fusion RRF), lecture directe d'un article, reranker multilingue.",
    dl: { "Outils": "hybrid_search, get_article, rerank", "Index": "articles entiers avec leur titre", "Pourquoi": "La baseline n'indexait pas les titres et ratait l'article 5." } },
  grader: { role: "Juge chaque article candidat : utile ou non pour répondre. Écarte les articles voisins mais hors sujet et dit s'il manque quelque chose.",
    dl: { "Sortie": "Grade (articles gardés, suffisant ?, manque)", "Technique": "Corrective RAG (Yan et al., 2024)", "Métrique visée": "Context precision" } },
  rewriter: { role: "Si le contexte est insuffisant, reformule la recherche à partir de ce qui manque et propose d'autres articles. Retour au Researcher (1 boucle max).",
    dl: { "Sortie": "Rewrite (requêtes, articles)", "Technique": "Boucle CRAG", "Métrique visée": "Context recall" } },
  writer: { role: "Rédige le premier jet avec exactement le même prompt RGPD que la baseline, sur le contexte filtré.",
    dl: { "Pourquoi": "Comparaison équitable : l'écart mesure l'orchestration, pas le prompt." } },
  critic: { role: "Relit la réponse : chaque affirmation est-elle appuyée par un article ? Répond-elle à la question ? Liste les affirmations non fondées, les manques et les digressions.",
    dl: { "Sortie": "Critique (note, fidèle, pertinent, listes)", "Technique": "Reflection, Self-RAG (Asai et al., 2023)", "Métriques visées": "Faithfulness, answer relevancy" } },
  reviser: { role: "Fait une recherche ciblée sur ce qui manque, puis réécrit la réponse en supprimant ce qui n'est pas fondé. Retour au Critic (2 révisions max).",
    dl: { "Technique": "Reflexion (Shinn et al., 2023)", "Mémoire": "la critique verbale guide la révision" } },
  end: { role: "Réponse finale structurée, avec les articles utilisés comme sources et la trace complète des agents.", dl: {} },
};
let graphEls = {};

function edgePath(a, b) {
  const A = NODES[a], B = NODES[b];
  if (a === "rewriter" && b === "researcher") return `M${A.x},${A.y - A.h / 2} C${A.x},${B.y - 10} ${A.x - 40},${B.y} ${B.x + B.w / 2},${B.y}`;
  if (a === "reviser" && b === "critic") return `M${A.x - A.w / 2},${A.y + 12} L${B.x + B.w / 2},${B.y + 12}`;
  if (a === "critic" && b === "reviser") return `M${A.x + A.w / 2},${A.y - 12} L${B.x - B.w / 2},${B.y - 12}`;
  if (a === "grader" && b === "rewriter") return `M${A.x + A.w / 2},${A.y} C${A.x + A.w / 2 + 40},${A.y} ${B.x - 30},${B.y + B.h / 2 + 10} ${B.x},${B.y + B.h / 2}`;
  if (A.y === B.y) { const dir = B.x > A.x ? 1 : -1; return `M${A.x + dir * A.w / 2},${A.y} L${B.x - dir * B.w / 2},${B.y}`; }
  if (a === "off_topic") return `M${A.x},${A.y + A.h / 2} L${B.x},${B.y - B.h / 2}`;
  return `M${A.x},${A.y + A.h / 2} L${B.x},${B.y - B.h / 2}`;
}

function renderGraph() {
  const svg = $("#graph"); svg.innerHTML = "";
  const defs = s("defs");
  for (const [id, col] of [["arr", "#a9b4c9"], ["arrLit", "#2a78d6"]]) {
    const m = s("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    m.append(s("path", { d: "M0,0 L10,5 L0,10 z", fill: col })); defs.append(m);
  }
  svg.append(defs);
  graphEls = { nodes: {}, edges: {} };
  for (const [a, b, label, loop] of EDGES) {
    const p = s("path", { d: edgePath(a, b), class: "edge" + (loop ? " loop" : ""), "marker-end": "url(#arr)" });
    svg.append(p); graphEls.edges[`${a}>${b}`] = p;
    if (label) {
      const A = NODES[a], B = NODES[b];
      let lx = (A.x + B.x) / 2, ly = (A.y + B.y) / 2 - 6;
      if (a === "grader" && b === "rewriter") { lx = 438; ly = 268; }
      if (a === "grader" && b === "writer") { lx = 352; ly = 300; }
      if (a === "planner" && b === "off_topic") { ly = 88; }
      if (a === "critic" && b === "reviser") { ly = 398; }
      if (a === "critic" && b === "end") { ly = 412; }
      svg.append(s("text", { x: lx, y: ly, class: "edge-label", "text-anchor": "middle" }, label));
    }
  }
  for (const [id, n] of Object.entries(NODES)) {
    const g = s("g", { class: "node", tabindex: 0, role: "button", "aria-label": n.t });
    g.append(s("rect", { x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: id === "question" || id === "end" ? n.h / 2 : 9 }));
    g.append(s("text", { x: n.x, y: n.y + (n.h > 40 ? -2 : 4), class: "t", "text-anchor": "middle" }, n.t));
    if (n.h > 40) g.append(s("text", { x: n.x, y: n.y + 14, class: "s", "text-anchor": "middle" }, n.s));
    g.addEventListener("click", () => selectAgent(id));
    g.addEventListener("keydown", (e) => { if (e.key === "Enter") selectAgent(id); });
    svg.append(g); graphEls.nodes[id] = g;
  }
  renderPipeline();
  selectAgent("planner");
}

function renderPipeline() {
  const svg = $("#pipeline"); svg.innerHTML = "";
  const steps = ["Question", "Multi-query ×4", "Top-6 chunks", "Articles parents", "Rerank top-3", "Génération"];
  const w = 94, gap = 13, y = 32;
  steps.forEach((t, i) => {
    const x = 6 + i * (w + gap);
    svg.append(s("rect", { x, y: y - 18, width: w, height: 36, rx: 8, fill: "#fff", stroke: "#e9b79f", "stroke-width": 1.5 }));
    svg.append(s("text", { x: x + w / 2, y: y + 4, "text-anchor": "middle", "font-size": 10.5, fill: "#52514e" }, t));
    if (i < steps.length - 1) svg.append(s("path", { d: `M${x + w + 1},${y} L${x + w + gap - 2},${y}`, stroke: "#e9b79f", "stroke-width": 1.6, "marker-end": "url(#arr)" }));
  });
}

function agentInfoHtml(id) {
  const info = AGENT_INFO[id], n = NODES[id];
  return `<h3>${esc(n.t)}</h3><p class="role">${esc(info.role)}</p>` +
    (Object.keys(info.dl).length ? `<dl>${Object.entries(info.dl).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "");
}
function selectAgent(id) {
  Object.entries(graphEls.nodes).forEach(([k, g]) => g.classList.toggle("sel", k === id));
  $("#agentInfo").innerHTML = `<div id="agentHead">${agentInfoHtml(id)}</div><div id="traceBox"></div>`;
  renderTraceList(-1);
}

function currentTrace() {
  const sel = $("#replayQ").value.split("|");
  const q = state.results.gold_sets[sel[0]]?.[+sel[1]];
  return q?.systems?.agentic?.trace || [];
}
function traceNode(line) { const k = line.split(":")[0].trim(); return NODES[k] ? k : (k === "off_topic" ? "off_topic" : null); }

function renderTraceList(active) {
  const box = $("#traceBox"); if (!box) return;
  const tr = currentTrace();
  if (!tr.length) { box.innerHTML = `<p class="muted small" style="margin-top:14px">Trace disponible dès que la question a été traitée par le RAG agentique.</p>`; return; }
  box.innerHTML = `<div class="muted small" style="margin-top:14px">Trace réelle de l'exécution (${tr.length} étapes)</div>`;
  const ul = h("ul", { class: "trace" });
  tr.forEach((l, i) => {
    const [k, ...rest] = l.split(":");
    ul.append(h("li", { class: i === active ? "on" : "", html: `<b>${esc(k)}</b>:${esc(rest.join(":"))}` }));
  });
  box.append(ul);
  const on = ul.querySelector("li.on"); if (on) on.scrollIntoView({ block: "nearest" });
}

let replayTimer = null;
function replay() {
  clearInterval(replayTimer);
  const tr = currentTrace();
  const path = ["question", ...tr.map(traceNode).filter(Boolean), "end"];
  Object.values(graphEls.nodes).forEach((g) => g.classList.remove("lit", "done", "sel"));
  Object.values(graphEls.edges).forEach((e) => { e.classList.remove("lit"); e.setAttribute("marker-end", "url(#arr)"); });
  let i = 0;
  const step = () => {
    if (i > 0) { graphEls.nodes[path[i - 1]].classList.replace("lit", "done"); }
    if (i >= path.length) { clearInterval(replayTimer); return; }
    const id = path[i];
    graphEls.nodes[id].classList.add("lit");
    if (i > 0) { const e = graphEls.edges[`${path[i - 1]}>${id}`]; if (e) { e.classList.add("lit"); e.setAttribute("marker-end", "url(#arrLit)"); } }
    if (id !== "question") $("#agentHead").innerHTML = agentInfoHtml(id);
    renderTraceList(id === "question" ? -1 : id === "end" ? tr.length : i - 1);
    i++;
  };
  step(); replayTimer = setInterval(step, 1100);
}

/* ── sélecteurs ──────────────────────────────────────────────── */
function fillQuestionSelect(sel, onlyGold) {
  sel.innerHTML = "";
  const items = onlyGold ? questions().map((q, i) => ({ g: state.gold, i, q })) : allQuestions();
  for (const { g, i, q } of items) {
    const done = q.systems.agentic ? "" : " (agentique en cours)";
    sel.append(h("option", { value: `${g}|${i}` }, `${onlyGold ? "" : (g === "gold_set" ? "C" : "D") + (i + 1) + " · "}${q.question}${done}`));
  }
}
function goldSeg(container, onChange) {
  container.innerHTML = "";
  for (const g of Object.keys(state.results.gold_sets)) {
    container.append(h("button", { class: g === state.gold ? "on" : "", onclick: () => { state.gold = g; onChange(); } }, GOLD_LABEL[g] || g));
  }
}

/* ── comparateur ─────────────────────────────────────────────── */
function renderCompare() {
  goldSeg($("#goldSeg"), () => { state.q = 0; renderCompare(); renderBench(); });
  const sel = $("#cmpQ"); fillQuestionSelect(sel, true); sel.value = `${state.gold}|${state.q}`;
  sel.onchange = () => { state.q = +sel.value.split("|")[1]; renderCompareBody(); };
  renderCompareBody();
}
function renderCompareBody() {
  const q = questions()[state.q]; if (!q) return;
  $("#cmpRef").innerHTML = `<b>Réponse de référence</b> — ${esc(q.reference)}` +
    (q.gold.length ? `<br><span class="small">Articles attendus : ${q.gold.map((n) => `<b>${n}</b>`).join(", ")}</span>` : "");
  for (const [sys, boxId] of [["baseline", "#cmpBase"], ["agentic", "#cmpAgent"]]) {
    const box = $(boxId), r = q.systems[sys], S = SYS[sys];
    box.innerHTML = `<div class="col-head"><h3><i style="background:${S.color}"></i>${S.label}</h3>` +
      (r ? `<span class="tag">${r.latency_s != null ? fmt(r.latency_s, 0) + " s" : ""} · ${r.articles.length} articles</span>` : "") + `</div>`;
    if (!r) { box.append(h("div", { class: "pending" }, "Réponse en cours de calcul sur le poste local…")); continue; }
    const arts = h("div", { class: "arts" });
    for (const n of r.articles) {
      const hit = q.gold.includes(n);
      const chip = h("span", { class: "art " + (hit ? "hit" : "miss") }, `Art. ${n}`);
      chip.addEventListener("mousemove", (e) => showTip(e, `<b>${esc(artTitle(n))}</b>${hit ? "<br>✓ attendu par la référence" : ""}`));
      chip.addEventListener("mouseleave", hideTip);
      arts.append(chip);
    }
    const missing = q.gold.filter((n) => !r.articles.includes(n));
    for (const n of missing) arts.append(h("span", { class: "art gold", title: artTitle(n) }, `Art. ${n} manquant`));
    box.append(arts, h("div", { class: "answer", html: mdLite(r.response) }));
    const bars = h("div", { class: "scorebars" });
    for (const m of state.results.metrics) {
      const v = r.scores[m];
      bars.append(h("span", {}, METRIC_LABEL[m]),
        h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(v ?? 0) * 100}%;background:${S.color}` })),
        h("span", { class: "val" }, v == null ? "…" : fmt(v, 2)));
    }
    box.append(bars);
  }
}

/* ── carte du RGPD ───────────────────────────────────────────── */
function renderMap() {
  const sel = $("#mapQ"); fillQuestionSelect(sel, false);
  sel.onchange = drawMap; drawMap();
}
function drawMap() {
  const svg = $("#map"); svg.innerHTML = "";
  const W = 1100, H = 600, M = 34;
  const X = (x) => M + x * (W - 2 * M), Y = (y) => M + y * (H - 2 * M);
  const [g, i] = $("#mapQ").value.split("|");
  const q = state.results.gold_sets[g]?.[+i];
  const base = new Set(q?.systems.baseline?.articles || []), ag = new Set(q?.systems.agentic?.articles || []), gold = new Set(q?.gold || []);
  for (const a of state.corpus) {
    const cx = X(a.x), cy = Y(a.y);
    const grp = s("g");
    if (gold.has(a.num)) grp.append(s("circle", { cx, cy, r: 18, class: "gold-mark" }));
    if (ag.has(a.num)) grp.append(s("circle", { cx, cy, r: 13, class: "ring-agent" }));
    if (base.has(a.num)) grp.append(s("circle", { cx, cy, r: 9, class: "ring-base" }));
    const dot = s("circle", { cx, cy, r: 5, class: "pt" });
    grp.append(dot);
    if (gold.has(a.num) || ag.has(a.num) || base.has(a.num)) grp.append(s("text", { x: cx + 21, y: cy + 4, class: "lbl" }, `Art. ${a.num}`));
    const hit = s("circle", { cx, cy, r: 14, class: "hit-area" });
    hit.addEventListener("mousemove", (e) => {
      dot.classList.add("hov");
      const tags = [base.has(a.num) && "récupéré par le RAG avancé", ag.has(a.num) && "récupéré par le RAG agentique", gold.has(a.num) && "attendu"].filter(Boolean);
      showTip(e, `<b>Article ${a.num} – ${esc(a.titre)}</b><br><span class="muted">${esc(a.chapitre)} · ${esc(a.titre_chapitre)}</span>` +
        (tags.length ? `<br>${tags.join(" · ")}` : "") + `<div style="margin-top:6px">${esc(a.extrait.slice(0, 260))}…</div>`);
    });
    hit.addEventListener("mouseleave", () => { dot.classList.remove("hov"); hideTip(); });
    grp.append(hit); svg.append(grp);
  }
}

/* ── benchmark ───────────────────────────────────────────────── */
function renderBench() {
  goldSeg($("#goldSeg2"), () => { state.q = 0; renderCompare(); renderBench(); });
  const qs = questions(), m = systemMeans(qs);
  $("#benchSub").innerHTML = `LLM du RAG : <code>${esc(state.results.llm || "—")}</code> · juge : <code>${esc(state.results.judge || "—")}</code>. ` +
    `Moyennes sur les questions traitées par les deux systèmes (${m.n}/${qs.length}` + (m.scored < m.n ? `, dont ${m.scored} déjà notées` : "") + ").";
  drawBars(m); fillDumbMetric(); drawDumbbell(); drawTable(m);
}
function axisY(svg, x0, x1, y, h0) {
  for (let t = 0; t <= 1.0001; t += 0.25) {
    const yy = y(t);
    svg.append(s("line", { x1: x0, x2: x1, y1: yy, y2: yy, stroke: "#ebe9e2" }));
    svg.append(s("text", { x: x0 - 8, y: yy + 4, "text-anchor": "end", "font-size": 11, fill: "#8a8983" }, t.toFixed(2).replace(".", ",")));
  }
}
function drawBars(m) {
  const svg = $("#barChart"); svg.innerHTML = "";
  const W = 560, H = 330, L = 44, R = 10, T = 18, B = 46;
  const keys = [...state.results.metrics, "avg"];
  const y = (v) => T + (1 - v) * (H - T - B);
  axisY(svg, L, W - R, y);
  const band = (W - L - R) / keys.length, bw = Math.min(30, band / 3);
  keys.forEach((k, i) => {
    const cx = L + band * i + band / 2;
    ["baseline", "agentic"].forEach((sys, j) => {
      const v = k === "avg" ? m[sys].avg : m[sys][k];
      if (v == null) return;
      const x = cx + (j === 0 ? -bw - 1 : 1), top = y(v), hgt = y(0) - top;
      const r = Math.min(4, hgt);
      const d = `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`;
      const p = s("path", { d, fill: SYS[sys].hex });
      p.addEventListener("mousemove", (e) => showTip(e, `<b>${SYS[sys].label}</b><br>${k === "avg" ? "Moyenne" : METRIC_LABEL[k]} : ${fmt(v)}`));
      p.addEventListener("mouseleave", hideTip);
      svg.append(p);
      svg.append(s("text", { x: x + bw / 2, y: top - 5, "text-anchor": "middle", "font-size": 10.5, fill: "#52514e" }, fmt(v, 2)));
    });
    const lbl = k === "avg" ? "Moyenne" : METRIC_LABEL[k];
    lbl.split(" ").forEach((w, li) => svg.append(s("text", { x: cx, y: H - B + 16 + li * 13, "text-anchor": "middle", "font-size": 11.5, fill: "#52514e", "font-weight": k === "avg" ? 700 : 400 }, w)));
  });
  svg.append(s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: "#cfccc3" }));
  if (m.scored === 0) svg.append(s("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: "#8a8983", "font-size": 14 }, "Notation RAGAS en cours de calcul…"));
}
function fillDumbMetric() {
  const sel = $("#dumbMetric"); if (sel.options.length) return;
  for (const k of state.results.metrics) sel.append(h("option", { value: k }, METRIC_LABEL[k]));
  sel.onchange = drawDumbbell;
}
function drawDumbbell() {
  const svg = $("#dumbbell"); svg.innerHTML = "";
  const k = $("#dumbMetric").value, qs = questions();
  const W = 560, L = 46, R = 16, T = 22, row = 28, H = T + row * qs.length + 24;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (v) => L + v * (W - L - R);
  for (let t = 0; t <= 1.0001; t += 0.25) {
    svg.append(s("line", { x1: x(t), x2: x(t), y1: T - 8, y2: H - 24, stroke: "#ebe9e2" }));
    svg.append(s("text", { x: x(t), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "#8a8983" }, t.toFixed(2).replace(".", ",")));
  }
  qs.forEach((q, i) => {
    const yy = T + i * row + row / 2;
    svg.append(s("text", { x: L - 10, y: yy + 4, "text-anchor": "end", "font-size": 11.5, fill: "#52514e" }, `Q${i + 1}`));
    const b = q.systems.baseline?.scores[k], a = q.systems.agentic?.scores[k];
    if (b != null && a != null) svg.append(s("line", { x1: x(b), x2: x(a), y1: yy, y2: yy, stroke: "#b8b5ab", "stroke-width": 2 }));
    for (const [sys, v] of [["baseline", b], ["agentic", a]]) {
      if (v == null) continue;
      const c = s("circle", { cx: x(v), cy: yy, r: 6, fill: SYS[sys].hex, stroke: "#fcfcfb", "stroke-width": 2 });
      svg.append(c);
    }
    const hit = s("rect", { x: 0, y: yy - row / 2, width: W, height: row, fill: "transparent" });
    hit.addEventListener("mousemove", (e) => showTip(e, `<b>Q${i + 1}</b> ${esc(q.question)}<br>${METRIC_LABEL[k]} : RAG avancé ${fmt(b, 2)} · RAG agentique ${fmt(a, 2)}`));
    hit.addEventListener("mouseleave", hideTip);
    hit.addEventListener("click", () => { state.q = i; renderCompare(); location.hash = "#comparateur"; });
    svg.append(hit);
  });
}
function drawTable(m) {
  const t = $("#benchTable");
  const row = (label, b, a, d = 3, higher = true) => {
    const delta = a != null && b != null ? a - b : null;
    const cls = delta == null || Math.abs(delta) < 1e-9 ? "" : (delta > 0) === higher ? "up" : "down";
    return `<tr><td>${label}</td><td class="n">${fmt(b, d)}</td><td class="n">${fmt(a, d)}</td><td class="n delta ${cls}">${delta == null ? "—" : (delta > 0 ? "+" : "") + fmt(delta, d)}</td></tr>`;
  };
  t.innerHTML = `<thead><tr><th>Métrique</th><th class="n">RAG avancé</th><th class="n">RAG agentique</th><th class="n">Δ</th></tr></thead><tbody>` +
    state.results.metrics.map((k) => row(METRIC_LABEL[k], m.baseline[k], m.agentic[k])).join("") +
    row("<b>Moyenne des 4 métriques</b>", m.baseline.avg, m.agentic.avg) +
    row("Articles attendus retrouvés", m.baseline.hit, m.agentic.hit, 2) +
    row("Latence moyenne (s)", m.baseline.latency, m.agentic.latency, 0, false) + "</tbody>";
}

/* ── démarrage ───────────────────────────────────────────────── */
async function main() {
  const [corpus, results] = await Promise.all([
    fetch("data/corpus.json").then((r) => r.json()),
    fetch("data/results.json").then((r) => r.json()),
  ]);
  state.corpus = corpus; state.results = results;
  if (!results.gold_sets[state.gold]) state.gold = Object.keys(results.gold_sets)[0];
  if (results.llm) $("#mLLM").textContent = results.llm;
  if (results.judge) $("#mJudge").textContent = results.judge;
  renderKpis();
  fillQuestionSelect($("#replayQ"), false);
  const firstAgentic = allQuestions().find((x) => x.q.systems.agentic);
  if (firstAgentic) $("#replayQ").value = `${firstAgentic.g}|${firstAgentic.i}`;
  $("#replayQ").onchange = () => renderTraceList(-1);
  $("#replayBtn").onclick = replay;
  renderGraph(); renderCompare(); renderMap(); renderBench();
  // lien de navigation actif
  const links = [...document.querySelectorAll(".topnav nav a")];
  const obs = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.isIntersecting) links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("section.block").forEach((sec) => obs.observe(sec));
}
main().catch((e) => { document.body.insertAdjacentHTML("afterbegin", `<p style="padding:20px;color:#c0392b">Erreur de chargement des données : ${esc(e.message)}</p>`); });
