"""Co-occurrence similarity network over text segments."""
from __future__ import annotations

import numpy as np
import networkx as nx

from ..nlp.tokenize import TextParams
from .matrix import build_segment_matrix


def run_similarity(doc_texts: list[str], docs: list[dict], params: dict,
                   progress=lambda f, s: None) -> dict:
    p = TextParams.from_dict(params)
    max_terms = min(200, max(5, int(params.get("max_terms", 60) or 60)))

    progress(0.1, "Segmenting corpus and building term matrix")
    sm = build_segment_matrix(doc_texts, p)

    # Keep the max_terms most frequent forms.
    top = np.argsort(-sm.form_freq)[:max_terms]
    X = sm.X[:, top]
    forms = [sm.forms[j] for j in top]
    freq = sm.form_freq[top]

    progress(0.4, "Computing co-occurrence matrix")
    seg_count = X.sum(axis=0)                 # segments containing each form
    C = X.T @ X                               # co-occurrence (segment level)

    progress(0.6, "Deriving similarity metrics and communities")
    edges = []
    G = nx.Graph()
    for i, f in enumerate(forms):
        G.add_node(f)
    n_forms = len(forms)
    for i in range(n_forms):
        for j in range(i + 1, n_forms):
            cooc = int(C[i, j])
            if cooc < 2:
                continue
            union = seg_count[i] + seg_count[j] - cooc
            jac = cooc / union if union > 0 else 0.0
            cos = cooc / np.sqrt(seg_count[i] * seg_count[j])
            edges.append({
                "source": forms[i], "target": forms[j],
                "cooc": cooc,
                "jaccard": round(float(jac), 4),
                "cosine": round(float(cos), 4),
            })
            G.add_edge(forms[i], forms[j], weight=cooc)

    community_of: dict[str, int] = {}
    if G.number_of_edges() > 0:
        communities = nx.community.greedy_modularity_communities(G, weight="weight")
        for ci, members in enumerate(communities):
            for m in members:
                community_of[m] = ci

    progress(0.9, "Assembling network")
    nodes = [
        {"id": f, "freq": int(freq[i]), "community": community_of.get(f, -1)}
        for i, f in enumerate(forms)
    ]
    return {"nodes": nodes, "edges": edges, "n_segments": int(sm.X.shape[0])}
