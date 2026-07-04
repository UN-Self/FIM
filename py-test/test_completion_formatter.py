import pytest

from fixtures import FORMATTER_CASES


@pytest.mark.parametrize("case", FORMATTER_CASES, ids=[c["name"] for c in FORMATTER_CASES])
def test_completion_formatter(run_node_module, case):
    result = run_node_module("completion-formatter", "formatCompletion", args=[{
        "completion": case["completion"],
        "documentContent": case["documentContent"],
        "cursorPosition": case["cursorPosition"],
        "language": case["language"],
    }])
    assert result is not None, f"formatCompletion returned null for {case['name']}"
    assert result == case["expected"], (
        f"{case['name']}: expected '{case['expected']}', got '{result}'"
    )
