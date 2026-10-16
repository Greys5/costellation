import csv
import importlib
import io
import json
from datetime import date
from decimal import Decimal

import pytest
from botocore.exceptions import ClientError, UnauthorizedSSOTokenError
from fastapi.testclient import TestClient

from backend.aws import AWS, merge_pages
from backend.cache import Cache

module = importlib.import_module("backend.app")


class FakeAWS:
    profile = "test"

    def accounts(self):
        return [{"Id": "000000000001", "Name": "Alpha", "State": "ACTIVE"}, {"Id": "000000000002", "Name": "Zero", "State": "ACTIVE"}]

    def costs(self, start, end, metric="UnblendedCost", granularity="MONTHLY", group="LINKED_ACCOUNT", filters=None):
        return [{"start": str(start), "end": str(end), "estimated": True, "total": "100.12345", "groups": [{"keys": ["000000000001"], "amount": "100.12345"}] if group else []}]

    def tags(self):
        return [{"TagKey": "environment", "Status": "Active"}]


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "aws", FakeAWS())
    monkeypatch.setattr(module, "cache", Cache(tmp_path / "cache.sqlite3"))
    monkeypatch.setattr(module, "today", lambda: date(2026, 10, 16))
    return TestClient(module.app)


def test_api_reconciles_and_caches_costs(client):
    first = client.get("/api/costs?start=2026-09-01&end=2026-10-01").json()
    assert first["data"]["total"] == "100.12345"
    assert first["data"]["estimated"] is True
    assert first["meta"]["cached"] is False
    assert client.get("/api/costs?start=2026-09-01&end=2026-10-01").json()["meta"]["cached"] is True


def test_api_rejects_nonreconciling_groups(client, monkeypatch):
    def mismatch(*args, **kwargs):
        return [{"start": "2026-09-01", "end": "2026-10-01", "estimated": False, "groups": [], "total": "1" if args[4] else "2"}]
    monkeypatch.setattr(module.aws, "costs", mismatch)
    result = client.get("/api/costs?start=2026-09-01&end=2026-10-01")
    assert result.status_code == 422
    assert "reconcile" in result.json()["detail"]


def test_invalid_dates_and_metrics_fail(client):
    assert client.get("/api/costs?start=2026-10-16&end=2026-10-01").status_code == 422
    assert client.get("/api/costs?start=2026-09-01&end=2026-10-01&metric=Other").status_code == 422
    assert client.get("/api/costs?start=2026-09-01&end=2026-11-01").status_code == 422


def test_accounts_include_zero_spend_and_csv_filters_match(client):
    result = client.get("/api/accounts").json()["data"]
    assert len(result["accounts"]) == 2
    assert result["accounts"][1]["current"] == "0"
    assert result["accounts"][0]["previous"] == "100.12345"
    exported = client.get("/api/export/accounts?search=Zero")
    rows = list(csv.reader(io.StringIO(exported.text)))
    assert len(rows) == 2
    assert rows[1][0] == "000000000002"
    assert rows[1][1] == "Zero"


def test_expired_sso_is_actionable_and_not_zero(client, monkeypatch):
    def fail():
        raise UnauthorizedSSOTokenError()
    monkeypatch.setattr(module.aws, "accounts", fail)
    response = client.get("/api/accounts")
    assert response.status_code == 503
    assert "sso login" in response.json()["detail"]
    assert "data" not in response.json()


def test_unavailable_history_is_actionable(client, monkeypatch):
    def fail(*args, **kwargs):
        raise ClientError({"Error": {"Code": "DataUnavailableException", "Message": "private details"}}, "GetCostAndUsage")
    monkeypatch.setattr(module.aws, "costs", fail)
    response = client.get("/api/costs?start=2026-09-01&end=2026-10-01")
    assert response.status_code == 502
    assert "shorter date range" in response.json()["detail"]
    assert "private details" not in response.text


def test_inactive_tag_coverage_rejected(client):
    assert client.get("/api/coverage?start=2026-09-01&end=2026-10-01&key=inactive").status_code == 422


def test_nonlocal_origins_and_hosts_rejected(client):
    assert client.get("/api/accounts", headers={"origin": "https://outside.example"}).status_code == 403
    assert client.get("/api/accounts", headers={"host": "outside.example"}).status_code == 400


def test_csv_formulas_escaped_but_negative_costs_preserved():
    response = module.csv_response([["=WEBSERVICE('x')", "-1.5", "+SUM(A1)", "@formula"]], "test.csv")
    rows = list(csv.reader(io.StringIO(response.body.decode())))
    assert rows[0] == ["'=WEBSERVICE('x')", "-1.5", "'+SUM(A1)", "'@formula"]


def test_cache_expiry_and_failed_refresh_preserve_prior_data(tmp_path):
    cache = Cache(tmp_path / "billing.db", ttl=0)
    assert cache.get("key", lambda: {"amount": "1"})["data"]["amount"] == "1"
    assert cache.get("key", lambda: {"amount": "2"})["data"]["amount"] == "2"
    def fail():
        raise RuntimeError("AWS unavailable")
    with pytest.raises(RuntimeError):
        cache.get("key", fail, refresh=True)
    cache.ttl = 86400
    assert cache.get("key", fail)["data"]["amount"] == "2"


def test_aws_pagination_uses_correct_token_names():
    class Client:
        def __init__(self, token):
            self.calls = []
            self.token = token

        def list_accounts(self, **kwargs):
            self.calls.append(kwargs.copy())
            return {self.token: "next"} if not kwargs else {}

    aws = AWS("test")
    org, ce = Client("NextToken"), Client("NextPageToken")
    aws._clients = {"organizations": org, "ce": ce}
    assert len(list(aws.pages("organizations", "list_accounts"))) == 2
    assert org.calls == [{}, {"NextToken": "next"}]
    assert len(list(aws.pages("ce", "list_accounts"))) == 2
    assert ce.calls == [{}, {"NextPageToken": "next"}]
