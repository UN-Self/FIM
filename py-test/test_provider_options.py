import pytest

from fixtures import PROVIDER_OPTIONS_CASES


@pytest.mark.parametrize("case", PROVIDER_OPTIONS_CASES, ids=[c["name"] for c in PROVIDER_OPTIONS_CASES])
def test_provider_request_body(run_node_module, case):
    result = run_node_module("provider-options", "createStreamRequestBodyFim", args=[
        case["provider"],
        case["prompt"],
        case["options"],
    ])
    assert result is not None, f"createStreamRequestBodyFim returned null for {case['name']}"

    expected = case["expected"]
    for key, value in expected.items():
        assert key in result, f"{case['name']}: missing key '{key}' in {result}"
        assert result[key] == value, f"{case['name']}: key '{key}' expected {value}, got {result[key]}"

    for key in case.get("expected_has", []):
        assert key in result, f"{case['name']}: missing expected key '{key}' in {result}"


def test_ollama_options_structure(run_node_module):
    result = run_node_module("provider-options", "createStreamRequestBodyFim", args=[
        "ollama",
        "test",
        {"temperature": 0.2, "numPredictFim": 128, "model": "codellama:7b"},
    ])
    assert "options" in result
    assert result["options"]["temperature"] == 0.2
    assert result["options"]["num_predict"] == 128


def test_litellm_messages_structure(run_node_module):
    result = run_node_module("provider-options", "createStreamRequestBodyFim", args=[
        "litellm",
        "test prompt",
        {"temperature": 0.5, "numPredictFim": 100, "model": "gpt-4"},
    ])
    assert "messages" in result
    assert isinstance(result["messages"], list)
    assert len(result["messages"]) == 1
    assert result["messages"][0]["content"] == "test prompt"
