import pytest

from fixtures import CACHE_TEST_DATA


@pytest.mark.parametrize("scenario", [
    CACHE_TEST_DATA["basic_set_get"],
    CACHE_TEST_DATA["lru_eviction"],
    CACHE_TEST_DATA["delete"],
    CACHE_TEST_DATA["overwrite"],
], ids=["basic_set_get", "lru_eviction", "delete", "overwrite"])
def test_lru_cache_operations(run_node_module, scenario):
    capacity = scenario["capacity"]
    operations = scenario["operations"]
    args = [capacity, operations]
    result = run_node_module("cache", "runCacheTest", args=args)
    assert result is not None, "runCacheTest returned null"
    assert result["passed"] is True, f"Cache test failed: {result.get('message', '')}"


def test_cache_normalize(run_node_module):
    data = CACHE_TEST_DATA["normalize"]
    result = run_node_module("cache", "normalizeKey", args=[data["text"]])
    assert result == data["expected"], f"normalize expected '{data['expected']}', got '{result}'"


def test_cache_key_with_suffix(run_node_module):
    data = CACHE_TEST_DATA["cache_key_with_suffix"]
    result = run_node_module("cache", "getKey", args=[{"prefix": data["prefix"], "suffix": data["suffix"]}])
    assert data["expected_contains"] in result, f"Expected '####' in cache key: {result}"


def test_cache_key_no_suffix(run_node_module):
    data = CACHE_TEST_DATA["cache_key_no_suffix"]
    result = run_node_module("cache", "getKey", args=[{"prefix": data["prefix"], "suffix": data["suffix"]}])
    assert result == data["expected"], f"Expected '{data['expected']}', got '{result}'"
