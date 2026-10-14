---
name: pr-reviewer
metadata:
  version: "1.0.0"
  category: DevOpsAndGovernance
description: >-
  Inspects open pull requests, verifies implementation scope against linked issues,
  evaluates correctness and functionality, enforces AGENTS.md conventions, submits
  an explicit APPROVE or REQUEST_CHANGES review via GitHub, and automatically squashes
  and merges approved PRs.
---

# Kaizen PR Reviewer Skill

This skill guides the automated and manual review of pull requests within Kaizen Agent. It validates issue scope, functional correctness, and repository standards, and enforces decisive review verdicts (`APPROVE` vs. `REQUEST_CHANGES`).

---

## 1. Quick CLI Commands

Review all open PRs with automatic squash-and-merge upon approval:
```bash
# Review all open PRs and auto-merge if approved
mise run pr:review

# Review all open PRs in dry-run mode (no reviews posted, no merges)
mise run pr:review:dry

# Review a specific PR by number
python scripts/review_pr.py --pr 116

# Dry-run review for a specific PR
python scripts/review_pr.py --pr 116 --dry-run

# Review without auto-merging approved PRs
python scripts/review_pr.py --pr 116 --no-auto-merge
```

---

## 2. Review Pillars & Rubric

Every pull request is evaluated across three core pillars:

### Pillar 1: Linked Issue Scope & Traceability
- **Detection**: Check GraphQL closing issue references, PR body (`Fixes #...`, `Closes #...`, `Refs #...`), branch name (`feat/<issue-id>-...`), and commit messages.
- **Completeness**: Have all acceptance criteria specified in the issue been satisfied?
- **Scope Creep**: Are there unprompted architectural deviations or unrelated file modifications?
- **Traceability**: If no issue is linked, the PR lacks traceability context and must be flagged.

### Pillar 2: Correctness & Functional Verification
- **Does it work as intended?**
- **Data Flow & Real Endpoints**: Ensure components are wired to real API endpoints rather than faking data or masking backend gaps without explicit documentation.
- **Edge Cases & Error Paths**: Check for potential crashes, unhandled errors, null/undefined references, and race conditions.
- **Build & Tests**: Verify code compiles cleanly and existing test suites pass.

### Pillar 3: Repository Architecture & AGENTS.md Standards
- **Monorepo Layout**: All frontend code must reside in `apps/web/` or `apps/mobile/`. Standalone directories at repository root (e.g. `dashboard_frontend/`) violate the monorepo layout and break Firebase Hosting and `mise` build tasks.
- **Single Source of Truth**: All inter-agent and API data schemas must be Pydantic models in `backend/core/models.py`.
- **Async Backend**: All FastAPI route handlers and agent methods must be `async def` without blocking I/O calls.
- **Design System Compliance**: Adhere to `docs/DESIGN.md` (Lumina Slate light liquid glass, CSS custom tokens, no dark mode, no Tailwind/shadcn in web/mobile).
- **Test Coverage**: Any new tool or backend logic must be covered by tests in `tests/`.

---

## 3. Review Verdicts & Actions

| Verdict | Condition | Action |
|---|---|---|
| **`APPROVE`** | Issue scope satisfied, logic works as intended, no architectural violations, passes conventions. | Posts approval review and **immediately squashes and merges** (`gh pr merge --squash --delete-branch`). |
| **`REQUEST_CHANGES`** | Functional bug, broken build, missing critical issue criteria, or directory layout violation. | Posts blocking review with actionable checklist of required changes. Merge is blocked. |

---

## 4. GitHub Self-Review Notice

GitHub prohibits users from formally approving or requesting changes on their own pull requests (`HTTP 422`). When the runner user identity matches the PR author, the reviewer posts a detailed review comment (`--comment`) detailing the explicit verdict. However, for squash-and-merge, the author is permitted to merge, allowing automated merging to proceed smoothly.
