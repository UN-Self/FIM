import pytest

from fixtures import FIM_TEMPLATE_CASES, FIM_AUTO_CASES, STOP_WORDS_CASES, REPO_LEVEL_DATA


@pytest.mark.parametrize("case", FIM_TEMPLATE_CASES, ids=[c["name"] for c in FIM_TEMPLATE_CASES])
def test_fim_template_format(run_node_module, case):
    result = run_node_module("fim-templates", "getFimPrompt", args=[
        case["model"],
        case["format"],
        case["args"],
    ])
    assert result is not None, f"getFimPrompt returned null for {case['name']}"
    for expected in case["expected_contains"]:
        assert expected in result, f"Expected '{expected}' in {case['name']} output: {result}"


@pytest.mark.parametrize("case", FIM_AUTO_CASES, ids=[c["model"] for c in FIM_AUTO_CASES])
def test_fim_auto_format_detection(run_node_module, case):
    args = {
        "context": "",
        "header": "",
        "fileContextEnabled": False,
        "prefixSuffix": {"prefix": "const x = ", "suffix": ";"},
        "language": "javascript",
    }
    result = run_node_module("fim-templates", "getFimPrompt", args=[
        case["model"],
        "automatic",
        args,
    ])
    assert result is not None, f"getFimPrompt returned null for {case['model']}"
    assert case["expected_format_contains"] in result, (
        f"Model '{case['model']}' should detect format containing '{case['expected_format_contains']}', got: {result}"
    )


@pytest.mark.parametrize("case", STOP_WORDS_CASES, ids=[f"{c['model']}_{c['format']}" for c in STOP_WORDS_CASES])
def test_stop_words(run_node_module, case):
    result = run_node_module("fim-templates", "getStopWords", args=[
        case["model"],
        case["format"],
    ])
    assert result is not None, f"getStopWords returned null for {case['model']}/{case['format']}"
    assert isinstance(result, list), f"getStopWords should return a list, got {type(result)}"
    assert case["expected_contains"] in result, (
        f"Expected stop word '{case['expected_contains']}' for {case['model']}/{case['format']}, got: {result}"
    )


def test_repository_level_template(run_node_module):
    data = REPO_LEVEL_DATA
    result = run_node_module("fim-templates", "getFimTemplateRepositoryLevel", args=[
        data["repo"],
        data["files"],
        data["prefixSuffix"],
        data["currentFileName"],
    ])
    assert result is not None, "getFimTemplateRepositoryLevel returned null"
    for expected in data["expected_contains"]:
        assert expected in result, f"Expected '{expected}' in repo-level template: {result}"


def test_default_fim_prompt_template(run_node_module):
    args = {
        "context": "",
        "header": "",
        "fileContextEnabled": False,
        "prefixSuffix": {"prefix": "test", "suffix": ""},
        "language": "javascript",
    }
    result = run_node_module("fim-templates", "getDefaultFimPromptTemplate", args=[args])
    assert result is not None
    assert "<PRE>" in result
    assert "<SUF>" in result
    assert "<MID>" in result


def test_file_context_included_when_enabled(run_node_module):
    args = {
        "context": "some context",
        "header": "",
        "fileContextEnabled": True,
        "prefixSuffix": {"prefix": "x = 1", "suffix": ""},
        "language": "python",
    }
    result = run_node_module("fim-templates", "getFimPrompt", args=["codellama:7b", "codellama", args])
    assert "some context" in result


def test_file_context_excluded_when_disabled(run_node_module):
    args = {
        "context": "some context",
        "header": "",
        "fileContextEnabled": False,
        "prefixSuffix": {"prefix": "x = 1", "suffix": ""},
        "language": "python",
    }
    result = run_node_module("fim-templates", "getFimPrompt", args=["codellama:7b", "codellama", args])
    assert "some context" not in result
