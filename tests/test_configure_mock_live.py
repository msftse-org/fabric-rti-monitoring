import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "configure_mock_live", Path(__file__).resolve().parents[1] / "scripts/configure-mock-live.py",
)
configure = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(configure)


class MockLiveConfigTests(unittest.TestCase):
    def test_environment_update_preserves_rayfin_and_replaces_old_values(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / ".env.local"
            env.write_text("# Fabric settings\nVITE_RAYFIN_API_URL=https://example.test\nVITE_TELEMETRY_MODE=snapshot\nVITE_TELEMETRY_MODE=snapshot\n")
            configure.update_env(env, {"VITE_TELEMETRY_MODE": "live", "VITE_KUSTO_DATABASE": "observability"})
            self.assertEqual(env.read_text(), "# Fabric settings\nVITE_RAYFIN_API_URL=https://example.test\nVITE_TELEMETRY_MODE=live\nVITE_KUSTO_DATABASE=observability\n")

    def test_redirects_use_the_active_deployed_apps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for app in configure.APPS:
                path = root / "apps" / app / "rayfin/.deployments.json"
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps({
                    "active": "demo",
                    "deployments": {"demo": {"hostingUrl": f"https://{app}.webapp.fabricapps.net"}},
                }))
            self.assertEqual(configure.redirect_uris(root, "/auth-redirect.html"),
                             [f"https://{app}.webapp.fabricapps.net/auth-redirect.html" for app in configure.APPS])

    def test_callback_rejects_an_external_or_fragmented_location(self):
        for value in ("https://example.test", "/callback#token", "/callback?token=example"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                configure.redirect_uris(Path("/nonexistent"), value)
