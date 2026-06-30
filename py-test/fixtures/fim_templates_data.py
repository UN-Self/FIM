FIM_TEMPLATE_CASES = [
    {
        "name": "codellama",
        "model": "codellama:7b",
        "format": "codellama",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "function hello() {", "suffix": "}"},
            "language": "javascript",
        },
        "expected_contains": ["<PRE>", "<SUF>", "<MID>", "function hello() {", "}"],
    },
    {
        "name": "deepseek",
        "model": "deepseek-coder:6.7b",
        "format": "deepseek",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "const x = ", "suffix": ";"},
            "language": "typescript",
        },
        "expected_contains": ["<\uff5cfim\u2581begin\uff5c", "<\uff5cfim\u2581hole\uff5c", "<\uff5cfim\u2581end\uff5c"],
    },
    {
        "name": "codestral",
        "model": "codestral:22b",
        "format": "codestral",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "def foo():", "suffix": "    pass"},
            "language": "python",
        },
        "expected_contains": ["[SUFFIX]", "[PREFIX]", "def foo():"],
    },
    {
        "name": "codeqwen",
        "model": "codeqwen:7b",
        "format": "codeqwen",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "import os", "suffix": ""},
            "language": "python",
        },
        "expected_contains": ["<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>"],
    },
    {
        "name": "qwen_with_context",
        "model": "qwen2.5-coder:7b",
        "format": "codeqwen",
        "args": {
            "context": "some context here",
            "header": "// Language: python",
            "fileContextEnabled": True,
            "prefixSuffix": {"prefix": "def foo():", "suffix": "    return 1"},
            "language": "python",
        },
        "expected_contains": ["<|file_sep|>", "<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>"],
    },
    {
        "name": "starcoder",
        "model": "starcoder2:3b",
        "format": "starcoder",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "console.log(", "suffix": ")"},
            "language": "javascript",
        },
        "expected_contains": ["<fim_prefix>", "<fim_suffix>", "<fim_middle>"],
    },
    {
        "name": "llama",
        "model": "llama-code:7b",
        "format": "llama",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "let x = 1", "suffix": ""},
            "language": "typescript",
        },
        "expected_contains": ["<PRE>", "<SUF>", "<MID>"],
    },
]

FIM_AUTO_CASES = [
    {"model": "codellama:7b", "expected_format_contains": "<PRE>"},
    {"model": "deepseek-coder:6.7b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "codestral:22b", "expected_format_contains": "[SUFFIX]"},
    {"model": "codeqwen:7b", "expected_format_contains": "<|fim_prefix|>"},
    {"model": "starcoder2:3b", "expected_format_contains": "<fim_prefix>"},
    {"model": "codegemma:7b", "expected_format_contains": "<fim_prefix>"},
    {"model": "unknown-model", "expected_format_contains": "<PRE>"},
]

STOP_WORDS_CASES = [
    {"model": "codellama:7b", "format": "codellama", "expected_contains": "<EOT>"},
    {"model": "deepseek-coder:6.7b", "format": "deepseek", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "qwen2.5-coder:7b", "format": "codeqwen", "expected_contains": "<|fim_pad|>"},
    {"model": "codestral:22b", "format": "codestral", "expected_contains": "[PREFIX]"},
    {"model": "starcoder2:3b", "format": "starcoder", "expected_contains": "<file_sep>"},
    {"model": "codegemma:7b", "format": "codegemma", "expected_contains": "<|file_separator|>"},
    {"model": "codellama:7b", "format": "automatic", "expected_contains": "<EOT>"},
    {"model": "unknown-model", "format": "automatic", "expected_contains": "<EOT>"},
]

REPO_LEVEL_DATA = {
    "repo": "my-project",
    "files": [
        {"uri": {"fsPath": "/test/a.ts"}, "text": "export const a = 1", "name": "a.ts", "isOpen": True, "relevanceScore": 10},
        {"uri": {"fsPath": "/test/b.ts"}, "text": "export const b = 2", "name": "b.ts", "isOpen": False, "relevanceScore": 5},
    ],
    "prefixSuffix": {"prefix": "const c = ", "suffix": ";"},
    "currentFileName": "c.ts",
    "expected_contains": ["<|repo_name|>my-project", "<|file_sep|>a.ts", "export const a = 1", "const c ="],
}
