"""End-to-end API flow: project -> corpus preview/save -> analysis -> result."""
import os
import tempfile
import time

os.environ["IRAMUTEQ_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.test_engine import bi_corpus  # noqa: E402

client = TestClient(app)


def _wait_done(aid: str, timeout=60) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        a = client.get(f"/api/analyses/{aid}").json()
        if a["status"] in ("done", "error"):
            return a
        time.sleep(0.2)
    raise AssertionError("analysis did not finish in time")


def test_full_flow():
    assert client.get("/api/health").json()["ok"] is True

    proj = client.post("/api/projects", json={"name": "Test project"}).json()
    pid = proj["id"]

    # preview legacy TXT upload
    txt = "**** *theme_cooking\nWe simmer the tomato sauce and bake bread.\n**** *theme_astro\nThe telescope observes galaxies and stars."
    r = client.post(f"/api/projects/{pid}/corpus/preview",
                    files={"file": ("c.txt", txt.encode(), "text/plain")},
                    data={"kind": "txt"})
    assert r.status_code == 200
    prev = r.json()
    assert len(prev["documents"]) == 2 and prev["detected_variables"] == ["theme"]

    # save a real corpus
    _, docs = bi_corpus(12)
    summary = client.put(f"/api/projects/{pid}/corpus", json={"documents": docs}).json()
    assert summary["n_documents"] == 12
    assert summary["variables"][0]["name"] == "theme"

    # run every analysis type through the async pipeline
    for atype, params in [
        ("stats", {"lang": "en"}),
        ("chd", {"lang": "en", "seg_size": 25, "max_classes": 2, "min_freq": 3}),
        ("similarity", {"lang": "en", "max_terms": 40}),
        ("afc", {"lang": "en", "variable": "theme"}),
    ]:
        r = client.post(f"/api/projects/{pid}/analyses", json={"type": atype, "params": params})
        assert r.status_code == 200, r.text
        a = _wait_done(r.json()["analysis"]["id"])
        assert a["status"] == "done", a["error"]
        assert a["result"] is not None

    # SSE endpoint emits a terminal event for a finished analysis
    hist = client.get(f"/api/projects/{pid}/analyses").json()
    assert len(hist) == 4
    with client.stream("GET", f"/api/analyses/{hist[0]['id']}/events") as s:
        body = ""
        for chunk in s.iter_text():
            body += chunk
            if '"status"' in body:
                break
        assert '"done"' in body or '"running"' in body


def test_error_envelope_shape():
    r = client.post("/api/projects/nope/analyses", json={"type": "stats", "params": {}})
    assert r.status_code == 404
    err = r.json()["error"]
    assert set(err) == {"code", "message", "hint"}
    assert err["message"] and not err["message"].startswith("Traceback")


def test_afc_error_is_friendly():
    proj = client.post("/api/projects", json={"name": "No vars"}).json()
    docs = [{"text": "hello world text one two three", "variables": {}} for _ in range(3)]
    client.put(f"/api/projects/{proj['id']}/corpus", json={"documents": docs})
    r = client.post(f"/api/projects/{proj['id']}/analyses",
                    json={"type": "afc", "params": {"variable": ""}})
    a = _wait_done(r.json()["analysis"]["id"])
    assert a["status"] == "error"
    assert a["error"]["hint"]
