import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from eligibility import evaluate_eligibility
from domain_schema import validate_opportunity
from matching import rank_opportunities, score_skills


class MatchingTests(unittest.TestCase):
    def test_required_skills_have_double_weight(self):
        result = score_skills(["python"], ["python", "sql"], ["flask"])
        self.assertEqual(result["skill_fit"], 40.0)
        self.assertEqual(result["missing_required_skills"], ["sql"])

    def test_hard_eligibility_failure_wins(self):
        result = evaluate_eligibility({"country_code": "IN"}, {"allowed_country_codes": ["US"]})
        self.assertEqual(result["eligibility_status"], "ineligible")

    def test_unknown_profile_information_needs_verification(self):
        result = evaluate_eligibility({}, {"allowed_study_levels": ["undergraduate"]})
        self.assertEqual(result["eligibility_status"], "needs_verification")

    def test_missing_rules_need_verification(self):
        result = evaluate_eligibility({}, {})
        self.assertEqual(result["eligibility_status"], "needs_verification")
        self.assertIn("Eligibility requirements were not provided", result["warnings"][0])

    def test_explicitly_unrestricted_is_eligible(self):
        result = evaluate_eligibility({}, {"unrestricted": True})
        self.assertEqual(result["eligibility_status"], "eligible")
        self.assertIn("unrestricted", result["eligibility_reasons"][0])

    def test_manual_opportunity_gets_stable_content_hash(self):
        data = {
            "title": "Demo Hackathon",
            "source_url": "https://example.com/demo",
            "opportunity_type": "hackathon",
        }
        first = validate_opportunity(data)
        second = validate_opportunity(data)
        self.assertEqual(first["content_hash"], second["content_hash"])
        self.assertEqual(len(first["content_hash"]), 64)

    def test_rank_is_deterministic_and_excludes_expired(self):
        profile = {"skill_ids": ["python"], "country_code": "IN", "study_level": None, "graduation_year": None}
        opportunities = [
            {"id": "expired", "title": "Expired", "review_status": "approved", "source_status": "open", "application_deadline_date": "2020-01-01", "required_skill_ids": ["python"], "preferred_skill_ids": [], "eligibility": {}},
            {"id": "live", "title": "Live", "review_status": "approved", "source_status": "open", "application_deadline_date": "2099-01-01", "required_skill_ids": ["python"], "preferred_skill_ids": [], "eligibility": {}},
        ]
        result = rank_opportunities(profile, opportunities)
        self.assertEqual([item["opportunity"]["id"] for item in result], ["live"])
        self.assertEqual(result[0]["eligibility_status"], "needs_verification")
        self.assertTrue(any("timezone" in warning for warning in result[0]["warnings"]))


if __name__ == "__main__":
    unittest.main()

