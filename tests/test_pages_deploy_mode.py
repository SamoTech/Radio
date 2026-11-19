"""Regression gates for production push deploy vs scheduled catalog refresh."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PIPELINE = ROOT / ".github" / "workflows" / "update-data.yml"


class PagesDeployModeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PIPELINE.read_text(encoding="utf-8")

    def test_schedule_still_refreshes_stations_and_sdr(self):
        self.assertIn('cron: "17 2 * * *"', self.source)
        self.assertIn('cron: "11 */6 * * *"', self.source)
        self.assertIn('echo "mode=stations" >> "$GITHUB_OUTPUT"', self.source)
        self.assertIn('echo "mode=sdr" >> "$GITHUB_OUTPUT"', self.source)

    def test_manual_refresh_choices_are_preserved(self):
        self.assertIn("options: [all, stations, sdr]", self.source)
        self.assertIn('echo "mode=${{ inputs.mode }}" >> "$GITHUB_OUTPUT"', self.source)

    def test_code_push_deploys_without_crawler(self):
        self.assertIn("branches: [main]", self.source)
        self.assertIn('echo "mode=none" >> "$GITHUB_OUTPUT"', self.source)
        self.assertEqual(self.source.count("if: steps.mode.outputs.mode != 'none'"), 3)
        self.assertIn('run: node --check js/app.js', self.source)

    def test_deployment_and_exact_sha_verification_are_still_required(self):
        self.assertIn("uses: actions/deploy-pages@", self.source)
        self.assertIn("scripts/deployment_provenance.py stamp", self.source)
        self.assertIn("scripts/deployment_provenance.py verify", self.source)


if __name__ == "__main__":
    unittest.main()
