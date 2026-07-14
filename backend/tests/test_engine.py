"""Verifier suite: parsing, segmentation, and the math engine.

Checks outputs against known algorithmic properties (CA orthogonality/inertia,
chi-square symmetry, Jaccard bounds, class separation on a synthetic corpus).
"""
import numpy as np
import pytest

from app.nlp.corpus_parse import parse_txt, parse_csv
from app.nlp.segment import segment_corpus
from app.nlp.tokenize import TextParams, tokenize
from app.analysis.ca import correspondence_analysis
from app.analysis.matrix import build_segment_matrix
from app.analysis.stats import run_stats
from app.analysis.chd import run_chd
from app.analysis.similarity import run_similarity
from app.analysis.afc import run_afc
from app.errors import AppError

# ---- synthetic bi-thematic corpus: cooking vs astronomy ----

COOK = ("We chop the onions and garlic, then simmer the tomato sauce slowly. "
        "The chef seasons the soup with basil and fresh pepper. "
        "Bake the bread in a hot oven until the crust turns golden. "
        "Knead the dough, add butter and flour, and let the pastry rest. ")
ASTRO = ("The telescope observes distant galaxies and bright nebulae at night. "
         "Astronomers measure the orbit of the planet around its star. "
         "The comet crosses the solar system beyond the asteroid belt. "
         "Gravity bends light near the massive black hole in the galaxy core. ")


def bi_corpus(n=12):
    """Docs alternate between themes; sentences are shuffled per-doc so that
    within-theme vocabulary co-occurs across segments (non-degenerate corpus)."""
    rng = np.random.default_rng(7)
    cook_sents = [s.strip() + "." for s in COOK.split(". ") if s.strip(". ")]
    astro_sents = [s.strip() + "." for s in ASTRO.split(". ") if s.strip(". ")]
    docs, texts = [], []
    for i in range(n):
        theme, pool = (("cooking", cook_sents) if i % 2 == 0 else ("astronomy", astro_sents))
        picks = rng.choice(len(pool), size=12, replace=True)
        text = " ".join(pool[j] for j in picks)
        texts.append(text)
        docs.append({"id": f"d{i}", "text": text, "variables": {"theme": theme}})
    return texts, docs


P = {"lang": "en", "lemmatize": True, "remove_stopwords": True, "custom_stopwords": [], "min_freq": 3}


# ---- parsing ----

def test_parse_txt_legacy_markers():
    raw = "**** *sex_f *age_young\nHello world one.\n**** *sex_m\nSecond doc text."
    docs, detected, _ = parse_txt(raw)
    assert len(docs) == 2
    assert docs[0]["variables"] == {"sex": "f", "age": "young"}
    assert docs[1]["variables"] == {"sex": "m"}
    assert detected == ["age", "sex"]


def test_parse_txt_strips_utf8_bom():
    # A leading UTF-8 BOM must not hide the first '****' marker (Windows editors
    # commonly save it). The first document must still be recognized.
    raw = "\ufeff**** *sex_f\nFirst doc text.\n**** *sex_m\nSecond doc text."
    docs, detected, warnings = parse_txt(raw)
    assert len(docs) == 2
    assert docs[0]["variables"] == {"sex": "f"}
    assert not any("ignored" in w for w in warnings)


def test_parse_txt_blank_line_fallback():
    docs, detected, warnings = parse_txt("First paragraph doc.\n\nSecond paragraph doc.")
    assert len(docs) == 2 and detected == [] and warnings


def test_parse_csv_text_column():
    raw = b"text,sex\nhello there general,f\nanother longer text row,m\n"
    docs, variables, _ = parse_csv(raw, "text")
    assert len(docs) == 2
    assert variables == ["sex"]
    assert docs[0]["variables"] == {"sex": "f"}


# ---- tokenization / segmentation ----

def test_tokenize_stopwords_and_lemmas():
    p = TextParams.from_dict(P)
    forms = tokenize("The chefs are cooking the onions", p)
    assert "the" not in forms and "are" not in forms
    assert "chef" in forms  # lemmatized plural


def test_underscored_tokens_survive_and_skip_lemmatization():
    # Iramuteq convention: underscores join compounds (dia_a_dia) and a
    # trailing underscore locks a word against lemmatization (havaianas_).
    p = TextParams.from_dict({**P, "lang": "pt"})
    forms = tokenize("No dia_a_dia uso Havaianas_ e casas grandes", p)
    assert "dia_a_dia" in forms          # kept whole, not split at underscores
    assert "havaianas_" in forms          # trailing underscore preserved
    assert "casa" in forms                # normal words still lemmatized
    assert "havaiana" not in forms        # protected word was NOT lemmatized


def test_segments_respect_target_size():
    texts, _ = bi_corpus(2)
    segs = segment_corpus(texts, seg_size=40)
    sizes = [len(s.tokens) for s in segs]
    assert all(sz <= 64 for sz in sizes)          # never wildly over target
    assert np.mean(sizes) > 15                     # not absurdly small either


# ---- CA math properties ----

def test_ca_known_properties():
    rng = np.random.default_rng(42)
    N = rng.integers(0, 20, size=(15, 6)).astype(float)
    ca = correspondence_analysis(N, n_axes=3)
    # masses sum to 1
    assert ca.row_mass.sum() == pytest.approx(1.0)
    assert ca.col_mass.sum() == pytest.approx(1.0)
    # per-axis contributions sum to 1
    for k in range(ca.row_coords.shape[1]):
        assert ca.row_contrib[:, k].sum() == pytest.approx(1.0, abs=1e-9)
        assert ca.col_contrib[:, k].sum() == pytest.approx(1.0, abs=1e-9)
    # centroid property: mass-weighted mean coordinate is 0
    assert np.allclose(ca.row_mass @ ca.row_coords, 0, atol=1e-9)
    # explained fractions descending and <= 1
    assert ca.explained.sum() <= 1.0 + 1e-9
    assert all(np.diff(ca.explained) <= 1e-12)


def test_ca_rejects_degenerate():
    with pytest.raises(AppError):
        correspondence_analysis(np.zeros((4, 4)))


# ---- stats ----

def test_stats_hapax_and_freq():
    texts, docs = bi_corpus(4)
    r = run_stats(texts, docs, P)
    assert r["total_tokens"] > 0
    assert r["freq"][0]["freq"] >= r["freq"][-1]["freq"]
    assert all(f["freq"] == 1 for f in [x for x in r["freq"] if x["form"] in r["hapax"]])
    assert {b["variable"] for b in r["by_variable"]} == {"theme"}


# ---- CHD ----

def test_chd_separates_themes():
    texts, docs = bi_corpus(12)
    r = run_chd(texts, docs, {**P, "seg_size": 25, "max_classes": 2})
    assert len(r["classes"]) == 2
    profiles = [{w["form"] for w in c["words"]} for c in r["classes"]]
    cook_markers = {"onion", "sauce", "oven", "dough", "chef", "soup", "bread"}
    astro_markers = {"telescope", "galaxy", "orbit", "planet", "comet", "star"}
    hits = [(len(t & cook_markers), len(t & astro_markers)) for t in profiles]
    # one class must be purely cooking vocabulary, the other purely astronomy
    assert any(c >= 3 and a == 0 for c, a in hits), hits
    assert any(a >= 3 and c == 0 for c, a in hits), hits
    # over-represented variable detected
    all_mods = {v["modality"] for c in r["classes"] for v in c["variables"]}
    assert all_mods & {"cooking", "astronomy"}
    # tree leaves carry the class ids
    def leaves(node):
        return [node["class_id"]] if not node["children"] else leaves(node["children"][0]) + leaves(node["children"][1])
    assert sorted(leaves(r["tree"])) == [1, 2]
    # chi2 word stats are valid
    for c in r["classes"]:
        for w in c["words"]:
            assert w["chi2"] >= 0 and 0 <= w["p"] <= 1 and w["freq_in"] <= w["freq_total"]


def test_chd_too_small_corpus_raises_friendly():
    with pytest.raises(AppError) as e:
        run_chd(["short text here."], [{"text": "short text here.", "variables": {}}], P)
    assert e.value.hint  # actionable hint present


# ---- similarity ----

def test_similarity_metrics_bounds_and_communities():
    texts, docs = bi_corpus(8)
    r = run_similarity(texts, docs, {**P, "max_terms": 40})
    assert r["nodes"] and r["edges"]
    for e in r["edges"]:
        assert 0 <= e["jaccard"] <= 1 and 0 <= e["cosine"] <= 1 and e["cooc"] >= 2
    comm = {n["id"]: n["community"] for n in r["nodes"]}
    # cooking and astronomy vocab should land in different communities
    if "sauce" in comm and "galaxy" in comm:
        assert comm["sauce"] != comm["galaxy"]


# ---- AFC ----

def test_afc_separates_modalities():
    texts, docs = bi_corpus(12)
    r = run_afc(texts, docs, {**P, "variable": "theme"})
    assert len(r["cols"]) == 2
    assert len(r["explained"]) >= 2
    xs = [c["x"] for c in r["cols"]]
    assert xs[0] * xs[1] < 0  # the two modalities oppose on axis 1
    words = {p["label"]: p for p in r["rows"]}
    if "sauce" in words and "galaxy" in words:
        assert words["sauce"]["x"] * words["galaxy"]["x"] < 0


def test_afc_missing_variable_raises_friendly():
    texts, docs = bi_corpus(4)
    with pytest.raises(AppError) as e:
        run_afc(texts, docs, {**P, "variable": "nonexistent"})
    assert "nonexistent" in e.value.message and e.value.hint


# ---- matrix guard rails ----

def test_matrix_min_freq_filter():
    texts, docs = bi_corpus(4)
    sm = build_segment_matrix(texts, TextParams.from_dict(P))
    assert (sm.form_freq >= P["min_freq"]).all()
    assert sm.X.max() == 1.0 and sm.X.min() == 0.0
