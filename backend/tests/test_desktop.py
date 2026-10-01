"""Desktop save bridge (desktop.py SaveApi), tested without a GUI.

`_ask_path` is the only part that opens a native dialog, so it is replaced
with a stub; everything else is the real extension and write logic.
"""
import base64

import desktop

DATA = base64.b64encode(b"\x89PNG fake").decode()


def _api(answer):
    """SaveApi whose dialog 'returns' `answer` and records what it was asked."""
    api = desktop.SaveApi()
    asked = {}

    def fake_ask(name, file_types):
        asked["name"], asked["file_types"] = name, file_types
        return answer

    api._ask_path = fake_ask
    return api, asked


def test_suggests_name_with_extension_and_typed_filter(tmp_path):
    api, asked = _api(str(tmp_path / "chd.svg"))
    assert api.save_file("chd", DATA, "svg") is True
    assert asked["name"] == "chd.svg"
    assert asked["file_types"] == ("SVG file (*.svg)", "All files (*.*)")


def test_appends_extension_the_user_deleted(tmp_path):
    api, _ = _api(str(tmp_path / "figure"))  # user retyped the name without ".png"
    assert api.save_file("afc", DATA, ".PNG") is True
    assert (tmp_path / "figure.png").read_bytes() == b"\x89PNG fake"
    assert not (tmp_path / "figure").exists()


def test_keeps_an_existing_extension(tmp_path):
    api, _ = _api(str(tmp_path / "net.SVG"))
    assert api.save_file("net", DATA, "svg") is True
    assert (tmp_path / "net.SVG").exists()
    assert not (tmp_path / "net.SVG.svg").exists()


def test_cancel_writes_nothing(tmp_path):
    api, _ = _api(None)
    assert api.save_file("x", DATA, "png") is False
    assert list(tmp_path.iterdir()) == []


def test_bad_base64_is_rejected_before_any_dialog():
    api, asked = _api("unused")
    assert api.save_file("x", "not base64!!", "png") is False
    assert asked == {}
