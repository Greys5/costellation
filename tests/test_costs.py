from datetime import date
from decimal import Decimal
from backend.aws import build_filter, merge_pages, summarize_accounts, comparison_window, validate_window
import pytest


def test_pagination_merges_same_period_and_preserves_negative_costs():
    def page(key, amount):
        return {"ResultsByTime": [{"TimePeriod": {"Start": "2026-09-01", "End": "2026-10-01"}, "Estimated": False, "Groups": [{"Keys": [key], "Metrics": {"UnblendedCost": {"Amount": amount, "Unit": "USD"}}}]}]}
    result = merge_pages([page("a", "100.005"), page("b", "-2.005")], "UnblendedCost")
    assert len(result) == 1
    assert sum(Decimal(g["amount"]) for g in result[0]["groups"]) == Decimal("98.000")


def test_inventory_includes_zero_and_historical_accounts():
    periods = [{"groups": [{"keys": ["a"], "amount": "10"}, {"keys": ["closed"], "amount": "-2"}]}]
    result = summarize_accounts([{"Id": "a", "Name": "Alpha", "State": "ACTIVE"}, {"Id": "b", "Name": "Beta", "State": "ACTIVE"}], periods)
    assert {r["id"]: r["amount"] for r in result} == {"a": "10", "b": "0", "closed": "-2"}
    assert next(r for r in result if r["id"] == "closed")["state"] == "HISTORICAL"


def test_filter_and_semantics():
    result = build_filter(["a", "b"], ["EC2"], [], "environment", ["prod"], False)
    assert len(result["And"]) == 3
    assert result["And"][0]["Dimensions"]["Values"] == ["a", "b"]
    assert build_filter([], [], [], "environment", [], True) == {"Tags": {"Key": "environment", "MatchOptions": ["ABSENT"]}}


def test_comparison_uses_equal_elapsed_days_and_caps_short_month():
    assert comparison_window(date(2026, 10, 1), date(2026, 10, 16)) == (date(2026, 9, 1), date(2026, 9, 16))
    assert comparison_window(date(2026, 3, 1), date(2026, 3, 31)) == (date(2026, 2, 1), date(2026, 3, 1))


def test_invalid_or_future_windows_fail():
    with pytest.raises(ValueError):
        validate_window(date(2026, 10, 2), date(2026, 10, 1), date(2026, 10, 16))
    with pytest.raises(ValueError):
        validate_window(date(2026, 10, 1), date(2026, 11, 1), date(2026, 10, 16))
