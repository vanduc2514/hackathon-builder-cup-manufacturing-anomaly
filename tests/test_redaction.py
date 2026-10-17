"""Unit tests for the brand redaction map (TKT-070 S9 / data/redaction.py)."""

from __future__ import annotations


def test_redaction_module_imports_without_side_effects():
    """Importing the module pulls in no GCP, Drive, or BigQuery clients.

    Verified by inspecting ``data.redaction.__dict__`` and walking the
    loaded ``sys.modules`` to ensure the heavy client libraries were
    not pulled in transitively. ``google.cloud``, ``googleapiclient``,
    and ``google.auth`` are explicitly forbidden.
    """
    import sys

    # Drop any cached import so the test reflects a cold start. The
    # conftest already pulled in some google.* libraries via the FastAPI
    # app fixture; we filter against the modules that ``data.redaction``
    # pulled in specifically by capturing the diff.
    before = set(sys.modules)
    sys.modules.pop("data.redaction", None)
    from data import redaction  # noqa: F401 — import for side-effect check

    after = set(sys.modules)
    new_modules = after - before
    forbidden_prefixes = (
        "google.cloud",
        "googleapiclient",
        "google.auth",
        "backend.tools.bigquery_tool",
        "scripts.sync_gdrive_kb",
    )
    leaked = [
        name
        for name in sorted(new_modules)
        if any(name == prefix or name.startswith(prefix + ".") for prefix in forbidden_prefixes)
    ]
    assert not leaked, f"data.redaction leaked heavy imports: {leaked}"


def test_brand_map_contains_expected_keys():
    """``BRAND_MAP`` carries the four canonical brand identifiers from ``scripts/sync_gdrive_kb.py:77``.

    The keys are checked as a set (order-independent) so the test is
    robust to re-shuffling of the source dict.
    """
    from data.redaction import BRAND_MAP

    expected = {"mitsubishi", "mds-e/eh", "mds-eh", "mds-e"}
    assert set(BRAND_MAP.keys()) == expected
    # Every value is a non-empty placeholder string, never an empty
    # string (which would silently round-trip as a deletion).
    for key, value in BRAND_MAP.items():
        assert isinstance(value, str) and value, f"{key} has empty placeholder"
        assert key != value, f"{key} maps to itself; not a redaction"


def test_redaction_version_is_semver_like():
    """``REDACTION_VERSION`` is a non-empty version string with a date prefix.

    The convention is ``YYYY-MM-DD.vN`` so the stamp sorts correctly in
    ``git log`` output and the manifest diff. The test accepts the
    documented format only — anything else is a schema-drift bug.
    """
    import re

    from data.redaction import REDACTION_VERSION

    assert isinstance(REDACTION_VERSION, str) and REDACTION_VERSION
    pattern = re.compile(r"^\d{4}-\d{2}-\d{2}\.v\d+$")
    assert pattern.match(REDACTION_VERSION), (
        f"REDACTION_VERSION {REDACTION_VERSION!r} does not match YYYY-MM-DD.vN"
    )
