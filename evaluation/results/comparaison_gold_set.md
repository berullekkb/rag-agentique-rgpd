# Comparaison RAGAS — `gold_set.json`

- LLM applicatif (identique pour les deux systèmes) : **qwen2.5:7b** (Ollama, local)
- Juge RAGAS (identique) : **qwen2.5:7b** (Ollama, local, température 0)
- Questions : 10

| Métrique | RAG avancé (baseline) | RAG agentique (LangGraph) | Δ (agentique − baseline) |
|---|---|---|---|
| Faithfulness | 0.692 | 0.603 | -0.088 |
| Answer relevancy | 0.674 | 0.684 | +0.010 |
| Context precision | 0.783 | 0.806 | +0.022 |
| Context recall | 0.717 | 0.983 | +0.267 |
| **Moyenne des 4 métriques** | 0.716 | 0.769 | +0.053 |
| Latence moyenne (s) | 159.8 | 524.0 | — |
