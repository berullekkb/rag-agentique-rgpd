"""Vérifie que les données du site sont cohérentes avant publication."""
import json
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
METRICS = {"faithfulness", "answer_relevancy",
           "llm_context_precision_with_reference", "context_recall"}


def load(name):
    return json.loads((DOCS / "data" / name).read_text(encoding="utf-8"))


def test_corpus():
    corpus = load("corpus.json")
    assert len(corpus) == 99
    assert sorted(a["num"] for a in corpus) == list(range(1, 100))
    for a in corpus:
        assert 0 <= a["x"] <= 1 and 0 <= a["y"] <= 1
        assert a["titre"] and a["chapitre"]


def test_results():
    res = load("results.json")
    assert set(res["metrics"]) == METRICS
    for questions in res["gold_sets"].values():
        for q in questions:
            assert q["question"] and q["reference"]
            assert all(1 <= n <= 99 for n in q["gold"])
            for sys, r in q["systems"].items():
                assert sys in {"baseline", "agentic"}
                assert r["response"]
                assert all(1 <= n <= 99 for n in r["articles"])
                for m, v in r["scores"].items():
                    assert m in METRICS
                    assert v is None or 0.0 <= v <= 1.0


def test_pages_reference_assets():
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    for asset in ("assets/app.js", "assets/style.css"):
        assert asset in html
        assert (DOCS / asset).exists()
