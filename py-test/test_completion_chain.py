import pytest

from fixtures import COMPLETION_CHAIN_CASES


@pytest.mark.parametrize("case", COMPLETION_CHAIN_CASES, ids=[c["name"] for c in COMPLETION_CHAIN_CASES])
def test_completion_chain_end_to_end(run_node_module, case):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": case["documentContent"],
        "cursorPosition": case["cursorPosition"],
        "language": case["language"],
        "provider": case["provider"],
        "mockChunks": case["mockChunks"],
        "contextLength": 100,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    assert result is not None, "runCompletionChain returned null"

    assert result["prompt"], "Prompt should not be empty"
    assert result["body"], "Request body should not be empty"
    assert result["rawCompletion"], "Raw completion should not be empty"
    assert result["chunkCount"] > 0, "Should have processed at least 1 chunk"

    assert case["expected_contains"] in result["rawCompletion"], (
        f"Raw completion '{result['rawCompletion']}' should contain '{case['expected_contains']}'"
    )

    assert result["body"]["stream"] is True, "Request body should have stream=true"
    assert result["body"]["model"] == case["provider"]["modelName"], "Model name should match"


def test_completion_chain_prompt_contains_fim_tokens(run_node_module):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": "function test() {",
        "cursorPosition": {"line": 0, "character": 18},
        "language": "javascript",
        "provider": {
            "provider": "ollama",
            "modelName": "codellama:7b",
            "fimTemplate": "codellama",
            "apiKey": "",
            "apiHostname": "127.0.0.1",
            "apiPort": 11434,
            "apiProtocol": "http",
            "apiPath": "/api/generate",
            "repositoryLevel": False,
        },
        "mockChunks": [{"response": "return true;\n}"}],
        "contextLength": 100,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    assert "<PRE>" in result["prompt"], "Codellama prompt should contain <PRE>"
    assert "<SUF>" in result["prompt"], "Codellama prompt should contain <SUF>"
    assert "<MID>" in result["prompt"], "Codellama prompt should contain <MID>"


def test_completion_chain_stop_word_truncation(run_node_module):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": "const x = ",
        "cursorPosition": {"line": 0, "character": 10},
        "language": "javascript",
        "provider": {
            "provider": "ollama",
            "modelName": "codellama:7b",
            "fimTemplate": "codellama",
            "apiKey": "",
            "apiHostname": "127.0.0.1",
            "apiPort": 11434,
            "apiProtocol": "http",
            "apiPath": "/api/generate",
            "repositoryLevel": False,
        },
        "mockChunks": [
            {"response": "1;\n<EOT>"},
            {"response": "should_not_appear"},
        ],
        "contextLength": 100,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    assert result["stopped"] == "stop_word", "Should have stopped at stop word"
    assert "<EOT>" not in result["rawCompletion"], "Stop word should be truncated"
    assert "should_not_appear" not in result["rawCompletion"], "Content after stop word should not appear"


def test_completion_chain_qwen_template(run_node_module):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": "def foo():",
        "cursorPosition": {"line": 0, "character": 9},
        "language": "python",
        "provider": {
            "provider": "ollama",
            "modelName": "qwen2.5-coder:7b",
            "fimTemplate": "codeqwen",
            "apiKey": "",
            "apiHostname": "127.0.0.1",
            "apiPort": 11434,
            "apiProtocol": "http",
            "apiPath": "/api/generate",
            "repositoryLevel": False,
        },
        "mockChunks": [{"response": "    return 1"}],
        "contextLength": 100,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    assert "<|fim_prefix|>" in result["prompt"], "Qwen prompt should contain <|fim_prefix|>"
    assert "<|fim_suffix|>" in result["prompt"], "Qwen prompt should contain <|fim_suffix|>"
    assert "<|fim_middle|>" in result["prompt"], "Qwen prompt should contain <|fim_middle|>"
    assert "return 1" in result["rawCompletion"]


def test_completion_chain_prefix_suffix_split(run_node_module):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": "line0\nline1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9",
        "cursorPosition": {"line": 5, "character": 3},
        "language": "javascript",
        "provider": {
            "provider": "ollama",
            "modelName": "codellama:7b",
            "fimTemplate": "codellama",
            "apiKey": "",
            "apiHostname": "127.0.0.1",
            "apiPort": 11434,
            "apiProtocol": "http",
            "apiPath": "/api/generate",
            "repositoryLevel": False,
        },
        "mockChunks": [{"response": "x"}],
        "contextLength": 5,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    ps = result["prefixSuffix"]
    assert "line4" in ps["prefix"], f"Prefix should contain line4: {ps['prefix']}"
    assert "line5" in ps["prefix"], f"Prefix should contain line5 (current line): {ps['prefix']}"
    assert "line6" in ps["suffix"], f"Suffix should contain line6: {ps['suffix']}"


def test_completion_chain_formatter_applied(run_node_module):
    result = run_node_module("completion-chain", "runCompletionChain", args=[{
        "documentContent": "",
        "cursorPosition": {"line": 0, "character": 0},
        "language": "javascript",
        "provider": {
            "provider": "ollama",
            "modelName": "codellama:7b",
            "fimTemplate": "codellama",
            "apiKey": "",
            "apiHostname": "127.0.0.1",
            "apiPort": 11434,
            "apiProtocol": "http",
            "apiPath": "/api/generate",
            "repositoryLevel": False,
        },
        "mockChunks": [{"response": "  const x = 1;"}],
        "contextLength": 100,
        "config": {"temperature": 0.2, "numPredictFim": 128, "keepAlive": "5m"},
    }])

    assert result["formattedCompletion"] == "const x = 1;", (
        f"Formatter should trim leading whitespace, got: '{result['formattedCompletion']}'"
    )
