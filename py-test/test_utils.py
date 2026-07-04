import pytest

from fixtures import PREFIX_SUFFIX_CASES


@pytest.mark.parametrize("case", PREFIX_SUFFIX_CASES, ids=[c["name"] for c in PREFIX_SUFFIX_CASES])
def test_get_prefix_suffix(run_node_module, case):
    result = run_node_module("utils", "getPrefixSuffix", args=[{
        "numLines": case["numLines"],
        "content": case["content"],
        "position": case["position"],
        "contextRatio": case["contextRatio"],
    }])
    assert result is not None, f"getPrefixSuffix returned null for {case['name']}"
    assert "prefix" in result and "suffix" in result
    assert case["expected_prefix_contains"] in result["prefix"], (
        f"{case['name']}: prefix '{result['prefix']}' should contain '{case['expected_prefix_contains']}'"
    )
    assert case["expected_suffix_contains"] in result["suffix"], (
        f"{case['name']}: suffix '{result['suffix']}' should contain '{case['expected_suffix_contains']}'"
    )


def test_get_is_middle_of_word(run_node_module):
    result = run_node_module("utils", "getIsMiddleOfString", args=[{
        "content": "hello world",
        "cursorPosition": {"line": 0, "character": 7},
    }])
    assert result is True, f"Middle of 'world' at pos 7 should return True, got {result}"


def test_not_middle_of_word(run_node_module):
    result = run_node_module("utils", "getIsMiddleOfString", args=[{
        "content": "hello world",
        "cursorPosition": {"line": 0, "character": 0},
    }])
    assert not result, f"Start of text at pos 0 should return falsy, got {result}"


def test_middle_with_underscore(run_node_module):
    result = run_node_module("utils", "getIsMiddleOfString", args=[{
        "content": "my_var_name",
        "cursorPosition": {"line": 0, "character": 4},
    }])
    assert result is True, f"Between _ and v should return True, got {result}"
