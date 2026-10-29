"""Deterministic eligibility evaluation for PS-61."""


def evaluate_eligibility(profile, rules):
    rules = rules or {}
    reasons, warnings = [], []
    definite_failure = False
    needs_verification = False
    country = profile.get("country_code")
    level = profile.get("study_level")
    year = profile.get("graduation_year")
    allowed_countries = rules.get("allowed_country_codes")
    allowed_levels = rules.get("allowed_study_levels")

    if allowed_countries:
        if not country:
            needs_verification = True
            warnings.append("Country is required to verify this opportunity.")
        elif country.upper() not in {str(v).upper() for v in allowed_countries}:
            definite_failure = True
            reasons.append("Country requirement is not satisfied.")
        else:
            reasons.append("Country requirement is satisfied.")
    if allowed_levels:
        if not level:
            needs_verification = True
            warnings.append("Study level is required to verify this opportunity.")
        elif level not in allowed_levels:
            definite_failure = True
            reasons.append("Study-level requirement is not satisfied.")
        else:
            reasons.append("Study-level requirement is satisfied.")
    minimum, maximum = rules.get("graduation_year_min"), rules.get("graduation_year_max")
    if minimum is not None or maximum is not None:
        if year is None:
            needs_verification = True
            warnings.append("Graduation year is required to verify this opportunity.")
        elif (minimum is not None and year < minimum) or (maximum is not None and year > maximum):
            definite_failure = True
            reasons.append("Graduation-year requirement is not satisfied.")
        else:
            reasons.append("Graduation-year requirement is satisfied.")
    unparsed_requirements = rules.get("unparsed_requirements") or []
    if unparsed_requirements:
        needs_verification = True
        warnings.append("Some source eligibility requirements need verification.")

    has_structured_rules = any(
        value
        for value in (
            allowed_countries,
            allowed_levels,
            minimum is not None,
            maximum is not None,
        )
    )
    if rules.get("unrestricted") is True and not unparsed_requirements and not has_structured_rules:
        reasons.append("The opportunity is explicitly marked as unrestricted.")
    elif not has_structured_rules and not unparsed_requirements:
        needs_verification = True
        warnings.append("Eligibility requirements were not provided and need verification.")
    if definite_failure:
        status = "ineligible"
    elif needs_verification:
        status = "needs_verification"
    else:
        status = "eligible"
    return {"eligibility_status": status, "eligibility_reasons": reasons, "warnings": warnings}

