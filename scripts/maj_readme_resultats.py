"""Réécrit le bloc « Résultats » du README à partir de docs/data/results.json."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABEL = {"faithfulness": "Faithfulness", "answer_relevancy": "Answer relevancy",
         "llm_context_precision_with_reference": "Context precision", "context_recall": "Context recall"}


def mean(v):
    v = [x for x in v if x is not None]
    return sum(v) / len(v) if v else None


def f(v, d=3):
    return "—" if v is None else f"{v:.{d}f}".replace(".", ",")


def delta(a, b, d=3):
    if a is None or b is None:
        return "—"
    x = b - a
    return ("+" if x >= 0 else "−") + f(abs(x), d)


def main():
    res = json.loads((ROOT / "docs/data/results.json").read_text(encoding="utf-8"))
    blocks = []
    for gold, qs in res["gold_sets"].items():
        both = [q for q in qs if "baseline" in q["systems"] and "agentic" in q["systems"]]
        scored = [q for q in both if all(q["systems"][s]["scores"].get(m) is not None
                                         for s in ("baseline", "agentic") for m in res["metrics"])]
        def hit(q, s):
            return len([g for g in q["gold"] if g in q["systems"][s]["articles"]]) / len(q["gold"]) if q["gold"] else None
        rows, avg = [], {}
        for s in ("baseline", "agentic"):
            avg[s] = {m: mean([q["systems"][s]["scores"][m] for q in scored]) for m in res["metrics"]}
            avg[s]["all"] = mean([avg[s][m] for m in res["metrics"]])
            avg[s]["hit"] = mean([hit(q, s) for q in both])
            avg[s]["lat"] = mean([q["systems"][s]["latency_s"] for q in both])
        rows.append("| | RAG avancé (baseline) | RAG agentique | Écart |")
        rows.append("|---|---|---|---|")
        for m in res["metrics"]:
            rows.append(f"| {LABEL[m]} | {f(avg['baseline'][m])} | {f(avg['agentic'][m])} | {delta(avg['baseline'][m], avg['agentic'][m])} |")
        rows.append(f"| **Moyenne des 4 métriques** | **{f(avg['baseline']['all'])}** | **{f(avg['agentic']['all'])}** | **{delta(avg['baseline']['all'], avg['agentic']['all'])}** |")
        rows.append(f"| Articles attendus retrouvés | {f(avg['baseline']['hit'], 2)} | {f(avg['agentic']['hit'], 2)} | {delta(avg['baseline']['hit'], avg['agentic']['hit'], 2)} |")
        rows.append(f"| Temps de réponse moyen (s) | {f(avg['baseline']['lat'], 0)} | {f(avg['agentic']['lat'], 0)} | — |")
        state = ("" if len(scored) == len(qs) else
                 f" — **résultats intermédiaires** : {len(scored)}/{len(qs)} questions notées pour les deux systèmes, calcul en cours")
        blocks.append(f"**Jeu `{gold}`** ({len(qs)} questions){state}.\n\n" + "\n".join(rows))
    txt = (f"LLM du RAG : `{res.get('llm')}` ; juge RAGAS : `{res.get('judge')}` (Ollama, local, température 0). "
           "Les notes RAGAS sont des moyennes sur les questions notées pour les deux systèmes.\n\n"
           + "\n\n".join(blocks))
    p = ROOT / "README.md"
    s = p.read_text(encoding="utf-8")
    s = re.sub(r"<!-- RESULTATS:START -->.*<!-- RESULTATS:END -->",
               "<!-- RESULTATS:START -->\n" + txt + "\n<!-- RESULTATS:END -->", s, flags=re.S)
    p.write_text(s, encoding="utf-8")
    print(txt)


if __name__ == "__main__":
    main()
