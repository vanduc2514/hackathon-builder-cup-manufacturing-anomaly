"""Unit tests for Kaizen PR Reviewer automation script."""

from __future__ import annotations

from unittest.mock import patch

from scripts.review_pr import (
    ReviewVerdict,
    clean_diff,
    evaluate_with_heuristics,
    extract_linked_issues,
    merge_approved_pr,
    submit_review,
)


def test_extract_linked_issues_from_body_and_branch() -> None:
    pr_data = {
        "number": 116,
        "headRefName": "feat/31-operator-dashboard",
        "body": "This PR addresses #32 and fixes #33. Also see refs #34.",
        "commits": [
            {"messageHeadline": "feat(ui): add 8d sheet #35", "messageBody": "Closes #36"},
        ],
    }

    with patch("scripts.review_pr.get_closing_issues", return_value=[37]):
        issues = extract_linked_issues(pr_data)

    # Should find 31 (branch), 32, 33, 34 (body), 35, 36 (commits), 37 (closing)
    assert 31 in issues
    assert 32 in issues
    assert 33 in issues
    assert 34 in issues
    assert 35 in issues
    assert 36 in issues
    assert 37 in issues
    assert 116 not in issues  # Self reference excluded


def test_clean_diff_filters_binaries_and_lockfiles() -> None:
    raw_diff = """diff --git a/src/app.png b/src/app.png
index 0000000..1111111 100644
Binary files differ
diff --git a/package-lock.json b/package-lock.json
index 1111111..2222222 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
+{"name": "test"}
diff --git a/apps/web/src/index.tsx b/apps/web/src/index.tsx
index 3333333..4444444 100644
--- a/apps/web/src/index.tsx
+++ b/apps/web/src/index.tsx
@@ -1 +1 @@
-console.log("old");
+console.log("new");
"""
    cleaned = clean_diff(raw_diff)
    assert "[Binary / asset / lockfile diff omitted]" in cleaned
    assert "apps/web/src/index.tsx" in cleaned
    assert 'console.log("new");' in cleaned


def test_verdict_to_markdown() -> None:
    verdict = ReviewVerdict(
        decision="APPROVE",
        summary="All acceptance criteria met.",
        scope_analysis="Matches issue #31 exactly.",
        correctness_and_functionality="Tested and working as intended.",
        repository_standards="Follows Lumina Slate tokens and AGENTS.md.",
        required_changes=[],
        recommendations=["Add docstring."],
    )

    md = verdict.to_markdown(pr_author="alice", current_user="bob")
    assert "# ✅ Kaizen PR Review: **APPROVE**" in md
    assert "GitHub Self-Review Notice" not in md
    assert "All acceptance criteria met." in md
    assert "- Add docstring." in md

    # Test self-review author notice
    self_md = verdict.to_markdown(pr_author="alice", current_user="alice")
    assert "GitHub Self-Review Notice" in self_md


def test_evaluate_with_heuristics_detects_layout_violation() -> None:
    pr_data = {
        "number": 116,
        "files": [
            {"path": "dashboard_frontend/src/App.tsx"},
            {"path": "dashboard_frontend/package.json"},
        ],
    }

    verdict = evaluate_with_heuristics(pr_data, issues=[])
    assert verdict.decision == "REQUEST_CHANGES"
    assert any("Directory layout violation" in change for change in verdict.required_changes)


def test_evaluate_with_heuristics_passes_clean_pr() -> None:
    pr_data = {
        "number": 120,
        "files": [
            {"path": "apps/web/src/App.tsx"},
            {"path": "backend/core/models.py"},
        ],
    }
    issues = [{"number": 120, "title": "Test Issue"}]

    verdict = evaluate_with_heuristics(pr_data, issues=issues)
    assert verdict.decision == "APPROVE"
    assert len(verdict.required_changes) == 0


def test_submit_review_handles_self_author() -> None:
    verdict = ReviewVerdict(
        decision="APPROVE",
        summary="Good",
        scope_analysis="Good",
        correctness_and_functionality="Good",
        repository_standards="Good",
    )

    with patch("scripts.review_pr.run_cmd", return_value=(0, "ok", "")) as mock_cmd:
        success = submit_review(
            pr_number=116,
            verdict=verdict,
            pr_author="vanduc2514",
            current_user="vanduc2514",
            dry_run=False,
        )
        assert success is True
        # Must call --comment because author == current_user
        called_args = mock_cmd.call_args[0][0]
        assert "--comment" in called_args
        assert "--approve" not in called_args


def test_submit_review_for_other_author() -> None:
    verdict = ReviewVerdict(
        decision="REQUEST_CHANGES",
        summary="Fix bugs",
        scope_analysis="Scope drift",
        correctness_and_functionality="Bugs found",
        repository_standards="Missing models",
        required_changes=["Fix layout"],
    )

    with patch("scripts.review_pr.run_cmd", return_value=(0, "ok", "")) as mock_cmd:
        success = submit_review(
            pr_number=116,
            verdict=verdict,
            pr_author="alice",
            current_user="bob",
            dry_run=False,
        )
        assert success is True
        called_args = mock_cmd.call_args[0][0]
        assert "--request-changes" in called_args


def test_merge_approved_pr_executes_squash() -> None:
    with patch("scripts.review_pr.run_cmd", return_value=(0, "merged", "")) as mock_cmd:
        success = merge_approved_pr(pr_number=116, dry_run=False)
        assert success is True
        called_args = mock_cmd.call_args[0][0]
        assert called_args == ["gh", "pr", "merge", "116", "--squash", "--delete-branch"]
