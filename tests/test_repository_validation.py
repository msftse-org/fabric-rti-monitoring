"""Public Terraform inputs are checked without reading private deployment artifacts."""

import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "validate_repository", ROOT / "scripts" / "validate_repository.py"
)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class RepositoryValidationTests(unittest.TestCase):
    def test_terraform_and_helm_sources_and_examples_are_checked(self):
        private_path = "/".join(["", "home", "example", "private"])
        for name in ("main.tf", "runtime.tftest.hcl", "devenv.tfvars.example", "backend.hcl.example", "_helpers.tpl", "NOTES.txt"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / name).write_text(f'source = "{private_path}"\n')
                errors = io.StringIO()
                with mock.patch.object(validator, "ROOT", root), contextlib.redirect_stderr(errors):
                    self.assertEqual(validator.main(), 1)
                self.assertIn(f"{name}: machine-specific absolute path", errors.getvalue())

    def test_private_inputs_and_generated_directories_are_excluded(self):
        private_path = "/".join(["", "home", "example", "private"])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in (
                ".terraform/modules/example/main.tf",
                ".azure/deployment-plan.md",
                "devenv.tfvars",
                "devenv.tfvars.json",
                "backend.local.hcl",
                "aks.local.yaml",
            ):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(private_path)
            with mock.patch.object(validator, "ROOT", root), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(validator.main(), 0)


if __name__ == "__main__":
    unittest.main()
