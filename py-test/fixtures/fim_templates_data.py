FIM_TEMPLATE_CASES = [
    {
        "name": "legacy_format_uses_deepseek",
        "model": "codellama:7b",
        "format": "codellama",
        "args": {
            "context": "",
            "header": "",
            "fileContextEnabled": False,
            "prefixSuffix": {"prefix": "function hello() {", "suffix": "}"},
            "language": "javascript",
        },
        "expected_contains": [
            "<\uff5cfim\u2581begin\uff5c",
            "<\uff5cfim\u2581hole\uff5c",
            "<\uff5cfim\u2581end\uff5c",
            "function hello() {",
            "}",
        ],
        "expected_not_contains": ["<PRE>", "<SUF>", "<MID>"],
    },
    {
        "name": "deepseek_format",
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
        "expected_not_contains": ["<PRE>", "<|fim_prefix|>", "[SUFFIX]"],
    },
]

FIM_AUTO_CASES = [
    {"model": "codellama:7b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "deepseek-coder:6.7b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "codestral:22b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "codeqwen:7b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "starcoder2:3b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "codegemma:7b", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
    {"model": "unknown-model", "expected_format_contains": "<\uff5cfim\u2581begin\uff5c"},
]

STOP_WORDS_CASES = [
    {"model": "codellama:7b", "format": "codellama", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "deepseek-coder:6.7b", "format": "deepseek", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "qwen2.5-coder:7b", "format": "codeqwen", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "codestral:22b", "format": "codestral", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "starcoder2:3b", "format": "starcoder", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "codegemma:7b", "format": "codegemma", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "codellama:7b", "format": "automatic", "expected_contains": "<\uff5cfim begin\uff5c>"},
    {"model": "unknown-model", "format": "automatic", "expected_contains": "<\uff5cfim begin\uff5c>"},
]

REPO_LEVEL_DATA = {
    "repo": "my-project",
    "files": [
        {"uri": {"fsPath": "/test/a.ts"}, "text": "export const a = 1", "name": "a.ts", "isOpen": True, "relevanceScore": 10},
        {"uri": {"fsPath": "/test/b.ts"}, "text": "export const b = 2", "name": "b.ts", "isOpen": False, "relevanceScore": 5},
    ],
    "prefixSuffix": {"prefix": "const c = ", "suffix": ";"},
    "currentFileName": "c.ts",
    "expected_contains": [
        "<\uff5cfim\u2581begin\uff5c",
        "<\uff5cfim\u2581hole\uff5c",
        "<\uff5cfim\u2581end\uff5c",
        "Repository: my-project",
        "File: a.ts",
        "export const a = 1",
        "File: c.ts",
        "const c = ",
        ";",
    ],
    "expected_not_contains": ["<|repo_name|>", "<|file_sep|>", "<|fim_prefix|>"],
}
