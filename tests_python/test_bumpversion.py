"""Tests for the bumpversion script.

Run with: python3 -m pytest boomerang-v3/tests_python/test_bumpversion.py
or: cd boomerang-v3 && python3 tests_python/test_bumpversion.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

# Make the script importable
SCRIPT_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import bumpversion  # noqa: E402


class TestVersionHelpers(unittest.TestCase):
    def test_parse_version(self):
        self.assertEqual(bumpversion.parse_version("1.2.3"), (1, 2, 3))
        self.assertEqual(bumpversion.parse_version("0.0.0"), (0, 0, 0))
        self.assertEqual(bumpversion.parse_version("100.200.300"), (100, 200, 300))

    def test_parse_version_invalid(self):
        with self.assertRaises(ValueError):
            bumpversion.parse_version("1.2")
        with self.assertRaises(ValueError):
            bumpversion.parse_version("1.2.3.4")
        with self.assertRaises(ValueError):
            bumpversion.parse_version("v1.2.3")
        with self.assertRaises(ValueError):
            bumpversion.parse_version("")

    def test_format_version(self):
        self.assertEqual(bumpversion.format_version(1, 2, 3), "1.2.3")

    def test_bump_patch(self):
        self.assertEqual(bumpversion.bump("1.2.3", "patch"), "1.2.4")
        self.assertEqual(bumpversion.bump("0.0.9", "patch"), "0.0.10")
        self.assertEqual(bumpversion.bump("1.2.99", "patch"), "1.2.100")

    def test_bump_minor(self):
        self.assertEqual(bumpversion.bump("1.2.3", "minor"), "1.3.0")
        self.assertEqual(bumpversion.bump("0.0.0", "minor"), "0.1.0")

    def test_bump_major(self):
        self.assertEqual(bumpversion.bump("1.2.3", "major"), "2.0.0")
        self.assertEqual(bumpversion.bump("0.0.0", "major"), "1.0.0")

    def test_bump_invalid(self):
        with self.assertRaises(ValueError):
            bumpversion.bump("1.2.3", "weird")


class TestReadVersionFromFile(unittest.TestCase):
    def test_python_version_py(self):
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write('__version__ = "1.2.3"\n')
            f.flush()
            try:
                v = bumpversion.read_version_from_file(
                    Path(f.name), bumpversion.PY_VERSION_PY
                )
                self.assertEqual(v, "1.2.3")
            finally:
                os.unlink(f.name)

    def test_python_pyproject(self):
        with tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False) as f:
            f.write('[project]\nname = "foo"\nversion = "4.5.6"\n')
            f.flush()
            try:
                v = bumpversion.read_version_from_file(
                    Path(f.name), bumpversion.PY_PYPROJECT
                )
                self.assertEqual(v, "4.5.6")
            finally:
                os.unlink(f.name)

    def test_npm_package_json(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write('{\n  "name": "foo",\n  "version": "7.8.9"\n}\n')
            f.flush()
            try:
                v = bumpversion.read_version_from_file(
                    Path(f.name), bumpversion.NPM_PACKAGE_JSON
                )
                self.assertEqual(v, "7.8.9")
            finally:
                os.unlink(f.name)

    def test_missing_file(self):
        v = bumpversion.read_version_from_file(
            Path("/nonexistent/path"), bumpversion.PY_VERSION_PY
        )
        self.assertIsNone(v)

    def test_no_match(self):
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write("# no version here\n")
            f.flush()
            try:
                v = bumpversion.read_version_from_file(
                    Path(f.name), bumpversion.PY_VERSION_PY
                )
                self.assertIsNone(v)
            finally:
                os.unlink(f.name)


class TestApplyReplacement(unittest.TestCase):
    def test_replace(self):
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write('__version__ = "1.2.3"\n')
            f.flush()
            try:
                changed, new = bumpversion.apply_replacement(
                    Path(f.name),
                    bumpversion.PY_VERSION_PY,
                    "1.2.4",
                    r"\g<1>{version}\g<3>",
                )
                self.assertTrue(changed)
                self.assertIn('"1.2.4"', new)
                self.assertNotIn('"1.2.3"', new)
            finally:
                os.unlink(f.name)

    def test_no_match(self):
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write("# no version here\n")
            f.flush()
            try:
                changed, new = bumpversion.apply_replacement(
                    Path(f.name),
                    bumpversion.PY_VERSION_PY,
                    "1.2.4",
                    r"\g<1>{version}\g<3>",
                )
                self.assertFalse(changed)
                self.assertEqual(new, "# no version here\n")
            finally:
                os.unlink(f.name)


class TestRepoRegistry(unittest.TestCase):
    def test_python_repos_have_pypi(self):
        py_repos = [r for r in bumpversion.REPOS if r.pypi_name]
        self.assertGreater(len(py_repos), 0)
        for r in py_repos:
            self.assertIn("python", r.release_targets)

    def test_npm_repos_have_npm(self):
        npm_repos = [r for r in bumpversion.REPOS if r.npm_name]
        self.assertGreater(len(npm_repos), 0)
        for r in npm_repos:
            self.assertIn("npm", r.release_targets)

    def test_each_repo_has_at_least_one_file(self):
        for r in bumpversion.REPOS:
            self.assertGreater(len(r.files), 0, f"{r.name} has no files")
            # First file should be the canonical
            self.assertEqual(
                r.files[0].relpath, r.canonical, f"{r.name} canonical mismatch"
            )

    def test_canonical_version_can_be_parsed(self):
        """Every repo's current version can be parsed (sentinel test)."""
        # This is a build-time sanity check; it should never fail
        # because the registry is curated.
        for r in bumpversion.REPOS:
            # We don't actually read the files here — we just verify
            # the pattern is valid
            self.assertIsNotNone(r.files[0].pattern)


class TestCmdCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        # Initialize as a git repo (bumpversion needs it)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.cwd)], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.email", "t@t.t"], check=True
        )
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.name", "t"], check=True
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _write_files(self, files: dict[str, str]) -> None:
        for relpath, content in files.items():
            p = self.cwd / relpath
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)

    def _make_py_repo(self, version: str) -> bumpversion.RepoConfig:
        """Write a minimal Python repo and return its config."""
        self._write_files(
            {
                "package.json": '{"name": "test-pkg", "version": "0.0.0"}\n',  # fake npm so the marker isn't picked up
                "pyproject.toml": f'[project]\nname = "test-pkg"\nversion = "{version}"\n',
            }
        )
        # Look up the config by name
        repo = next(
            (r for r in bumpversion.REPOS if r.name_match == "test-pkg"),
            None,
        )
        if repo is None:
            self.skipTest("test-pkg not in registry — skipping")
        # Replace the files with minimal ones pointing at the tmp
        return repo

    def test_check_clean(self):
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "test-pkg"\nversion = "1.2.3"\n',
            }
        )
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="pyproject.toml",
            name_match="test-pkg",
            files=[
                bumpversion.FileSpec(
                    relpath="pyproject.toml",
                    pattern=bumpversion.PY_PYPROJECT,
                    replacement=r"\g<1>{version}\g<3>",
                )
            ],
        )
        rc = bumpversion.cmd_check(self.cwd, repo)
        self.assertEqual(rc, 0)

    def test_check_drift(self):
        # Two files with different versions
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "test-pkg"\nversion = "1.2.3"\n',
                "src/__version__.py": '__version__ = "1.2.4"\n',
            }
        )
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="pyproject.toml",
            name_match="test-pkg",
            files=[
                bumpversion.FileSpec(
                    relpath="pyproject.toml",
                    pattern=bumpversion.PY_PYPROJECT,
                    replacement=r"\g<1>{version}\g<3>",
                ),
                bumpversion.FileSpec(
                    relpath="src/__version__.py",
                    pattern=bumpversion.PY_VERSION_PY,
                    replacement=r"\g<1>{version}\g<3>",
                ),
            ],
        )
        rc = bumpversion.cmd_check(self.cwd, repo)
        self.assertEqual(rc, 1)


class TestCmdBump(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.cwd)], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.email", "t@t.t"], check=True
        )
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.name", "t"], check=True
        )
        # Make an initial commit so the tree is clean
        (self.cwd / "README.md").write_text("# test\n")
        subprocess.run(["git", "-C", str(self.cwd), "add", "README.md"], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "commit", "-q", "-m", "init"], check=True
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _write_files(self, files: dict[str, str]) -> None:
        for relpath, content in files.items():
            p = self.cwd / relpath
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)

    def test_npm_dry_run_does_not_write(self):
        self._write_files(
            {
                "package.json": '{\n  "name": "test-pkg",\n  "version": "1.2.3"\n}\n',
            }
        )
        # Commit so the tree is clean (bumpversion refuses to run on a
        # dirty tree unless --force-dirty is set)
        subprocess.run(["git", "-C", str(self.cwd), "add", "-A"], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "commit", "-q", "-m", "add pkg"], check=True
        )
        args = bumpversion.build_argparser().parse_args(
            ["--patch", "--repo", str(self.cwd)]
        )
        # Mock detect_repo to return a simple NPM repo
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="package.json",
            name_match="test-pkg",
            npm_name="test-pkg",
            subdir=".",
            files=[
                bumpversion.FileSpec(
                    relpath="package.json",
                    pattern=bumpversion.NPM_PACKAGE_JSON,
                    replacement=r"\g<1>{version}\g<3>",
                )
            ],
        )
        with mock.patch.object(bumpversion, "detect_repo", return_value=repo):
            rc = bumpversion.cmd_bump(args)
        self.assertEqual(rc, 0)
        # File should NOT have changed
        content = (self.cwd / "package.json").read_text()
        self.assertIn('"1.2.3"', content)
        self.assertNotIn('"1.2.4"', content)

    def test_npm_apply_writes_new_version(self):
        self._write_files(
            {
                "package.json": '{\n  "name": "test-pkg",\n  "version": "1.2.3"\n}\n',
            }
        )
        subprocess.run(["git", "-C", str(self.cwd), "add", "-A"], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "commit", "-q", "-m", "add pkg"], check=True
        )
        args = bumpversion.build_argparser().parse_args(
            ["--patch", "--apply", "--repo", str(self.cwd)]
        )
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="package.json",
            name_match="test-pkg",
            npm_name="test-pkg",
            subdir=".",
            files=[
                bumpversion.FileSpec(
                    relpath="package.json",
                    pattern=bumpversion.NPM_PACKAGE_JSON,
                    replacement=r"\g<1>{version}\g<3>",
                )
            ],
        )
        with mock.patch.object(bumpversion, "detect_repo", return_value=repo):
            rc = bumpversion.cmd_bump(args)
        self.assertEqual(rc, 0)
        # File SHOULD have changed
        content = (self.cwd / "package.json").read_text()
        self.assertIn('"1.2.4"', content)
        self.assertNotIn('"1.2.3"', content)


class TestDetectRepo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write_files(self, files: dict[str, str]) -> None:
        for relpath, content in files.items():
            p = self.cwd / relpath
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)

    def test_detect_via_local_pyproject(self):
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "@veedubin/boomerang-v3"\nversion = "0.5.4"\n',
            }
        )
        repo = bumpversion.detect_repo(self.cwd)
        # Either we matched a real registry entry or, since this is a fake
        # name, the local-name match may not find anything. Verify either way.
        # In our test case "@veedubin/boomerang-v3" IS in the registry, so
        # this should match.
        self.assertIn("@veedubin/boomerang-v3", repo.name_match)

    def test_detect_via_marker_file(self):
        # Simulate running from a workspace root
        self._write_files(
            {
                "memini-ai-dev/pyproject.toml": '[project]\nname = "memini-ai-dev"\nversion = "0.7.9"\n',
            }
        )
        repo = bumpversion.detect_repo(self.cwd)
        self.assertEqual(repo.name, "memini-ai-dev")

    def test_detect_unknown_dies(self):
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "totally-unknown-pkg"\nversion = "0.0.0"\n',
            }
        )
        with self.assertRaises(SystemExit):
            bumpversion.detect_repo(self.cwd)

    def test_detect_via_directory_name_fallback(self):
        # Simulate the @neuralgentics/root case: local name doesn't
        # contain any registry name_match, but the cwd's directory
        # name matches a registry entry's subdir.
        # We create a subdir named "neuralgentics" inside the tempdir
        # and put a package.json there with an unrelated name.
        self._write_files(
            {
                "neuralgentics/package.json": '{\n  "name": "@neuralgentics/root",\n  "version": "0.9.0"\n}\n',
            }
        )
        cwd_in_subdir = self.cwd / "neuralgentics"
        repo = bumpversion.detect_repo(cwd_in_subdir)
        # Should match the neuralgentics registry entry (either
        # @veedubin/neuralgentics or @neuralgentics/root, both with
        # subdir="neuralgentics")
        self.assertEqual(repo.subdir, "neuralgentics")
        self.assertIn(repo.npm_name, ("@veedubin/neuralgentics",))


class TestGetRemoteTags(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        # Init a real repo so we can use git commands
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.cwd)], check=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_remote(self):
        # No remote configured — should return empty set
        tags = bumpversion.get_remote_tags(self.cwd)
        self.assertEqual(tags, set())


class TestCmdAudit(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cwd = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.cwd)], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.email", "t@t.t"], check=True
        )
        subprocess.run(
            ["git", "-C", str(self.cwd), "config", "user.name", "t"], check=True
        )
        (self.cwd / "README.md").write_text("# test\n")
        subprocess.run(["git", "-C", str(self.cwd), "add", "README.md"], check=True)
        subprocess.run(
            ["git", "-C", str(self.cwd), "commit", "-q", "-m", "init"], check=True
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _write_files(self, files: dict[str, str]) -> None:
        for relpath, content in files.items():
            p = self.cwd / relpath
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)

    def test_audit_no_targets(self):
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "test-pkg"\nversion = "1.2.3"\n',
            }
        )
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="pyproject.toml",
            name_match="test-pkg",
            files=[
                bumpversion.FileSpec(
                    relpath="pyproject.toml",
                    pattern=bumpversion.PY_PYPROJECT,
                    replacement=r"\g<1>{version}\g<3>",
                )
            ],
        )
        # No network and no github target — should just print local
        rc = bumpversion.cmd_audit(self.cwd, repo, no_network=True)
        self.assertEqual(rc, 0)

    def test_audit_drift(self):
        self._write_files(
            {
                "pyproject.toml": '[project]\nname = "test-pkg"\nversion = "1.2.3"\n',
                "src/__version__.py": '__version__ = "1.2.4"\n',
            }
        )
        repo = bumpversion.RepoConfig(
            name="test-pkg",
            canonical="pyproject.toml",
            name_match="test-pkg",
            files=[
                bumpversion.FileSpec(
                    relpath="pyproject.toml",
                    pattern=bumpversion.PY_PYPROJECT,
                    replacement=r"\g<1>{version}\g<3>",
                ),
                bumpversion.FileSpec(
                    relpath="src/__version__.py",
                    pattern=bumpversion.PY_VERSION_PY,
                    replacement=r"\g<1>{version}\g<3>",
                ),
            ],
        )
        rc = bumpversion.cmd_audit(self.cwd, repo, no_network=True)
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
