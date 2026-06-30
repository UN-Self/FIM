import json
import subprocess
import os
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEST_HELPERS = PROJECT_ROOT / "py-test" / "helpers"
TEST_OUT = TEST_HELPERS / "out"


def ensure_modules_built():
    if not TEST_OUT.exists() or not (TEST_OUT / "fim-templates.test.js").exists():
        result = subprocess.run(
            ["node", str(TEST_HELPERS / "build_test_modules.cjs")],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to build test modules:\n{result.stderr}")


@pytest.fixture(scope="session", autouse=True)
def build_test_modules():
    ensure_modules_built()
    yield


@pytest.fixture
def run_node_module():
    def _run(module_name, fn_name, args=None, mock_fetch=None):
        payload = json.dumps({
            "module": module_name,
            "fn": fn_name,
            "args": args or [],
            "mockFetch": mock_fetch,
        })

        proc = subprocess.run(
            ["node", str(TEST_HELPERS / "test_runner.cjs")],
            input=payload,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
            cwd=str(PROJECT_ROOT),
        )

        if proc.returncode != 0:
            raise RuntimeError(
                f"Node process exited with code {proc.returncode}\n"
                f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
            )

        data = json.loads(proc.stdout)
        if not data.get("success"):
            raise AssertionError(
                f"Module execution failed: {data.get('error')}\n"
                f"Stack: {data.get('stack', '')}"
            )
        return data.get("result")

    return _run
