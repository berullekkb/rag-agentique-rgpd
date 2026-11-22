"""
Exporte les données du site interactif (docs/data/*.json).

  • corpus.json   : les 99 articles du RGPD + leur position sur la « carte »
                    (t-SNE des embeddings utilisés par le RAG)
  • results.json  : pour chaque question des gold sets, les réponses, articles
                    récupérés, scores RAGAS, latences et trace des agents des
                    deux systèmes (baseline / agentique)

Usage (depuis la racine du dépôt) :
    python scripts/export_site_data.py            # corpus + résultats
    python scripts/export_site_data.py --skip-corpus
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
RESULTS = ROOT / "evaluation" / "results"
OUT = ROOT / "docs" / "data"
sys.path.insert(0, str(BACKEND))

METRICS = ["faithfulness", "answer_relevancy",
           "llm_context_precision_with_reference", "context_recall"]
ART_RE = re.compile(r"Article\s+(\d+|premier)", re.I)


def art_num(label: str) -> int | None:
    m = ART_RE.search(label or "")
    if not m:
        return None
    return 1 if m.group(1).lower() == "premier" else int(m.group(1))


def gold_articles(reference: str) -> list[int]:
    """Articles cités dans la réponse de référence (« art. 5 », « (16) »,
    « articles 37 à 39 », « art. 44 à 49 »…)."""
    found: set[int] = set()
    text = reference.replace(" ", " ")
    for a, b in re.findall(r"(\d{1,2})\s*à\s*(\d{1,2})", text):     # « 37 à 39 »
        a, b = int(a), int(b)
        if 1 <= a < b <= 99 and b - a <= 10:
            found.update(range(a, b + 1))
    for n in re.findall(r"(?:articles?|art\.)\s*(\d{1,2})", text, re.I):
        found.add(int(n))
    for n in re.findall(r"\((\d{1,2})\)", text):
        found.add(int(n))
    return sorted(x for x in found if 1 <= x <= 99)


def context_article(ctx: str) -> int | None:
    lines = ctx.splitlines()
    return art_num(lines[1] if len(lines) > 1 else ctx[:200])


# ── corpus ──────────────────────────────────────────────────────────
def export_corpus() -> None:
    import numpy as np
    from sklearn.manifold import TSNE

    from app.core.config import get_settings
    from app.services.indexing import parse_rgpd_html
    from app.services.vectorstore import build_embedding_model

    settings = get_settings()
    data = parse_rgpd_html(str(BACKEND / settings.rgpd_html_path))
    arts = []
    for chap in data:
        for a in chap["contenu"]:
            arts.append({
                "num": art_num(a["article"]),
                "titre": a["titre_article"],
                "chapitre": chap["chapitre"].replace("CHAPITRE ", "Ch. "),
                "titre_chapitre": chap["titre_chapitre"],
                "texte": a["contenu_article"],
            })
    emb = build_embedding_model(settings.embedding_model)
    vecs = np.array(emb.embed_documents(
        [f"{a['titre']}. {a['texte'][:1500]}" for a in arts]))
    xy = TSNE(n_components=2, perplexity=12, random_state=42, init="pca",
              learning_rate="auto").fit_transform(vecs)
    xy = (xy - xy.min(0)) / (xy.max(0) - xy.min(0))
    out = [{
        "num": a["num"], "titre": a["titre"], "chapitre": a["chapitre"],
        "titre_chapitre": a["titre_chapitre"],
        "extrait": (a["texte"][:420] + "…") if len(a["texte"]) > 420 else a["texte"],
        "mots": len(a["texte"].split()),
        "x": round(float(x), 4), "y": round(float(y), 4),
    } for a, (x, y) in zip(arts, xy)]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "corpus.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"corpus.json : {len(out)} articles")


# ── résultats d'évaluation ──────────────────────────────────────────
def export_results() -> None:
    golds = {}
    llm = judge = None
    for gold_path in sorted((ROOT / "evaluation").glob("gold_set*.json")):
        stem = gold_path.stem
        gen_p, sc_p = RESULTS / f"generations_{stem}.json", RESULTS / f"scores_{stem}.json"
        if not gen_p.exists():
            continue
        gens = json.loads(gen_p.read_text(encoding="utf-8"))
        scores = json.loads(sc_p.read_text(encoding="utf-8")) if sc_p.exists() else {}
        llm = gens.get("_llm") or llm
        judge = scores.get("_judge") or judge
        questions = []
        for item in json.loads(gold_path.read_text(encoding="utf-8")):
            q = item["question"]
            row = {"question": q, "reference": item["reference"],
                   "gold": gold_articles(item["reference"]), "systems": {}}
            for system in ("baseline", "agentic"):
                g = gens.get(system, {}).get(q)
                if not g:
                    continue
                arts = [context_article(c) for c in g["retrieved_contexts"]]
                row["systems"][system] = {
                    "response": g["response"],
                    "articles": [a for a in arts if a is not None],
                    "latency_s": g.get("latency_s"),
                    "trace": g.get("trace", []),
                    "scores": {m: scores.get(system, {}).get(q, {}).get(m) for m in METRICS},
                }
            questions.append(row)
        golds[stem] = questions
    out = {"llm": llm, "judge": judge, "metrics": METRICS, "gold_sets": golds}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    n = {k: sum(len(q["systems"]) for q in v) for k, v in golds.items()}
    print(f"results.json : {n}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-corpus", action="store_true")
    args = ap.parse_args()
    if not args.skip_corpus:
        export_corpus()
    export_results()
