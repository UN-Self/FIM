CACHE_TEST_DATA = {
    "basic_set_get": {
        "capacity": 3,
        "operations": [
            {"op": "set", "key": "a", "value": "value_a"},
            {"op": "set", "key": "b", "value": "value_b"},
            {"op": "get", "key": "a", "expected": "value_a"},
            {"op": "get", "key": "b", "expected": "value_b"},
            {"op": "get", "key": "nonexistent", "expected": None},
        ],
    },
    "lru_eviction": {
        "capacity": 2,
        "operations": [
            {"op": "set", "key": "x", "value": "val_x"},
            {"op": "set", "key": "y", "value": "val_y"},
            {"op": "get", "key": "x", "expected": "val_x"},
            {"op": "set", "key": "z", "value": "val_z"},
            {"op": "get", "key": "y", "expected": None},
            {"op": "get", "key": "x", "expected": "val_x"},
            {"op": "get", "key": "z", "expected": "val_z"},
        ],
    },
    "delete": {
        "capacity": 5,
        "operations": [
            {"op": "set", "key": "del_me", "value": "bye"},
            {"op": "delete", "key": "del_me"},
            {"op": "get", "key": "del_me", "expected": None},
        ],
    },
    "overwrite": {
        "capacity": 5,
        "operations": [
            {"op": "set", "key": "k", "value": "old"},
            {"op": "set", "key": "k", "value": "new"},
            {"op": "get", "key": "k", "expected": "new"},
        ],
    },
    "normalize": {
        "text": "line1\nline2 line3",
        "expected": "line1line2line3",
    },
    "cache_key_with_suffix": {
        "prefix": "hello world",
        "suffix": "goodbye",
        "expected_contains": "####",
    },
    "cache_key_no_suffix": {
        "prefix": "just prefix",
        "suffix": "",
        "expected": "justprefix",
    },
}
