"""Protect the standalone Cloudflare Kiwi Worker from missing quota bindings."""
import pathlib
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class KiwiWranglerTests(unittest.TestCase):
    def test_global_sqlite_quota_is_configured_with_named_class(self):
        cfg = tomllib.loads((ROOT / "proxy/kiwi-wrangler.toml").read_text())
        self.assertEqual(cfg["main"], "kiwi-worker.js")
        self.assertEqual(cfg["name"], "radio-atlas-kiwi-bridge")
        bindings = cfg["durable_objects"]["bindings"]
        self.assertTrue(any(
            entry["name"] == "KIWI_QUOTAS" and entry["class_name"] == "KiwiQuota"
            for entry in bindings
        ))
        self.assertTrue(any(
            "KiwiQuota" in entry.get("new_sqlite_classes", [])
            for entry in cfg["migrations"]
        ))

    def test_worker_exports_durable_class_and_fails_closed_without_binding(self):
        worker = (ROOT / "proxy/kiwi-worker.js").read_text()
        quota = (ROOT / "proxy/kiwi-quota.js").read_text()
        self.assertIn("export { KiwiQuota } from './kiwi-quota.js';", worker)
        self.assertIn("env.KIWI_QUOTAS.getByName('global')", worker)
        self.assertIn("await quota.checkIp(ip)", worker)
        self.assertIn("await quota.reserve(ip, receiver)", worker)
        self.assertIn("export class KiwiQuota extends DurableObject", quota)


if __name__ == "__main__":
    unittest.main()
