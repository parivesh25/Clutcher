"""Pure, deterministic skill scoring and opportunity ranking."""
from datetime import date, datetime, timezone

from eligibility import evaluate_eligibility


def score_skills(student_skill_ids, required_skill_ids, preferred_skill_ids):
    student = set(student_skill_ids or [])
    required = set(required_skill_ids or [])
    preferred = set(preferred_skill_ids or []) - required
    weights = {skill: 2 for skill in required}
    weights.update({skill: 1 for skill in preferred})
    matched = {skill for skill in weights if skill in student}
    total = sum(weights.values())
    return {
        "skill_fit": round(100 * sum(weights[s] for s in matched) / total, 1) if total else None,
        "matched_skills": sorted(matched),
        "missing_required_skills": sorted(required - student),
        "missing_preferred_skills": sorted(preferred - student),
    }


def _deadline_passed(opportunity, today):
    if opportunity.get("source_status") == "closed":
        return True
    value = opportunity.get("application_deadline_date")
    if value:
        try:
            return date.fromisoformat(value) < today
        except ValueError:
            return False
    value = opportunity.get("application_deadline_at")
    if value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.date() < today
        except ValueError:
            return False
    return False


def rank_opportunities(profile, opportunities, now=None, include_ineligible=False):
    now = now or datetime.now(timezone.utc)
    today = now.date()
    results = []
    for opportunity in opportunities:
        if opportunity.get("review_status", "approved") != "approved":
            continue
        if _deadline_passed(opportunity, today):
            continue
        eligibility = evaluate_eligibility(profile, opportunity.get("eligibility") or {})
        if eligibility["eligibility_status"] == "ineligible" and not include_ineligible:
            continue
        skills = score_skills(profile.get("skill_ids", []), opportunity.get("required_skill_ids", []), opportunity.get("preferred_skill_ids", []))
        warnings = list(eligibility["warnings"])
        if not opportunity.get("application_deadline_date") and not opportunity.get("application_deadline_at"):
            warnings.append("Deadline is unknown.")
        elif opportunity.get("application_deadline_date") and not opportunity.get("application_deadline_at"):
            warnings.append("Deadline has no published time or timezone; verify it on the source page.")
        results.append({"opportunity": opportunity, **skills, **eligibility, "warnings": warnings})
    group = {"eligible": 0, "needs_verification": 1, "ineligible": 2}
    results.sort(key=lambda item: (group[item["eligibility_status"]], -(item["skill_fit"] if item["skill_fit"] is not None else -1), item["opportunity"].get("title", "").lower(), item["opportunity"].get("id", "")))
    return results

