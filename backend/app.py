import csv
import io
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .aws import AWS, METRICS, build_filter, comparison_window, month_shift, summarize_accounts, validate_window
from .cache import Cache

ROOT = Path(__file__).resolve().parent.parent
aws = AWS(os.getenv("AWS_PROFILE", "default"))
cache = Cache(ROOT / ".cache" / "billing.sqlite3")
app = FastAPI(title="Costellation Cloud Cost Intelligence", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])


@app.middleware("http")
async def local_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin:
        from urllib.parse import urlparse
        parsed = urlparse(origin)
        if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.scheme not in {"http", "https"}:
            return JSONResponse({"detail": "Only local browser origins are allowed."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(ClientError)
async def aws_error(request, exc):
    code = exc.response.get("Error", {}).get("Code", "AWS error")
    if code in {"AccessDeniedException", "AccessDenied", "UnauthorizedOperation"}:
        message = "AWS access denied. Verify Organizations and Cost Explorer read permissions."
    elif code in {"DataUnavailableException", "BillExpirationException"}:
        message = "AWS billing data is unavailable for this period. Try a shorter date range."
    elif code in {"ExpiredToken", "ExpiredTokenException", "UnauthorizedException"}:
        message = "AWS session expired. Run aws sso login with your configured AWS profile in your terminal, then retry."
    else:
        message = f"AWS could not complete this query ({code}). Retry or narrow the filters."
    return JSONResponse({"detail": message}, status_code=502)


@app.exception_handler(BotoCoreError)
async def credentials_error(request, exc):
    return JSONResponse({"detail": "AWS connection or credentials unavailable. Run aws sso login with your configured AWS profile in your terminal, then retry."}, status_code=503)


@app.exception_handler(ValueError)
async def validation_error(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=422)


def today():
    return datetime.now(timezone.utc).date()


def cached(kind, args, loader, refresh):
    return cache.get([aws.profile, kind, args], loader, refresh)


def total(periods):
    return str(sum((Decimal(p["total"]) for p in periods), Decimal(0)))


@app.get("/api/status")
def status(refresh: bool = False):
    return cached("identity", [], aws.identity, refresh)


@app.get("/api/options")
def options(refresh: bool = False):
    end = today()
    start = month_shift(end.replace(day=1), -12)
    def load():
        return {"accounts": aws.accounts(), "tags": aws.tags(), "services": aws.dimensions(start, end, "SERVICE"), "regions": aws.dimensions(start, end, "REGION"), "earliest": str(start), "today": str(end)}
    return cached("options", [str(start), str(end)], load, refresh)


@app.get("/api/tag-values")
def tag_values(key: str = Query(min_length=1, max_length=128), refresh: bool = False):
    end = today()
    start = month_shift(end.replace(day=1), -12)
    return cached("tag-values", [str(start), str(end), key], lambda: aws.tag_values(start, end, key), refresh)


def query_data(start, end, metric, granularity, group, accounts, services, regions, tag_key, tag_values, absent, refresh):
    validate_window(start, end, today())
    if metric not in METRICS or granularity not in {"MONTHLY", "DAILY"} or group not in {"LINKED_ACCOUNT", "SERVICE", "REGION"}:
        raise ValueError("Unsupported metric, granularity, or grouping.")
    filters = build_filter(accounts, services, regions, tag_key, tag_values, absent)
    args = [str(start), str(end), metric, granularity, group, filters]
    def load():
        periods = aws.costs(start, end, metric, granularity, group, filters)
        # Independent total detects pagination or grouping reconciliation problems.
        totals = aws.costs(start, end, metric, granularity, None, filters)
        if abs(Decimal(total(periods)) - Decimal(total(totals))) > Decimal("0.01"):
            raise ValueError("AWS grouped costs do not reconcile with totals. Refresh before using this report.")
        aggregates = {}
        for period in periods:
            for row in period["groups"]:
                key = row["keys"][0]
                aggregates[key] = aggregates.get(key, Decimal(0)) + Decimal(row["amount"])
        return {"periods": periods, "total": total(totals), "estimated": any(p["estimated"] for p in totals), "groups": [{"key": k, "amount": str(v)} for k, v in sorted(aggregates.items(), key=lambda kv: kv[1], reverse=True)], "metric": metric, "currency": "USD", "start": str(start), "end": str(end), "group": group}
    return cached("costs", args, load, refresh)


@app.get("/api/costs")
def costs(start: date, end: date, metric: str = "UnblendedCost", granularity: str = "MONTHLY", group: str = "LINKED_ACCOUNT", accounts: list[str] = Query(default=[]), services: list[str] = Query(default=[]), regions: list[str] = Query(default=[]), tag_key: str = "", tag_values: list[str] = Query(default=[]), absent: bool = False, refresh: bool = False):
    return query_data(start, end, metric, granularity, group, accounts, services, regions, tag_key, tag_values, absent, refresh)


@app.get("/api/accounts")
def account_report(metric: str = "UnblendedCost", refresh: bool = False):
    if metric not in METRICS:
        raise ValueError("Unsupported metric.")
    end = today()
    current = end.replace(day=1)
    previous = month_shift(current, -1)
    _, comparison_end = comparison_window(current, end)
    def load():
        inventory = aws.accounts()
        prior = aws.costs(previous, current, metric)
        mtd = aws.costs(current, end, metric) if current < end else []
        comparable = aws.costs(previous, comparison_end, metric) if comparison_end > previous else []
        base = summarize_accounts(inventory, prior + mtd)
        def amounts(periods):
            return {r["id"]: r["amount"] for r in summarize_accounts([], periods)}
        pm, cm, pc = amounts(prior), amounts(mtd), amounts(comparable)
        for row in base:
            row.update(previous=pm.get(row["id"], "0"), current=cm.get(row["id"], "0"), comparable=pc.get(row["id"], "0"))
            row.pop("amount")
        return {"accounts": sorted(base, key=lambda r: Decimal(r["previous"]), reverse=True), "previous_start": str(previous), "current_start": str(current), "end": str(end), "previous_total": total(prior), "current_total": total(mtd), "comparable_total": total(comparable), "estimated": any(p["estimated"] for p in mtd), "metric": metric}
    return cached("account-report", [str(end), metric], load, refresh)


@app.get("/api/coverage")
def coverage(start: date, end: date, key: str = Query(min_length=1), metric: str = "UnblendedCost", accounts: list[str] = Query(default=[]), refresh: bool = False):
    validate_window(start, end, today())
    if metric not in METRICS:
        raise ValueError("Unsupported metric.")
    def load():
        active = {t["TagKey"] for t in aws.tags() if t["Status"] == "Active"}
        if key not in active:
            raise ValueError("Coverage is available only for active cost allocation tags.")
        full = aws.costs(start, end, metric, "MONTHLY", None, build_filter(accounts, [], [], "", [], False))
        missing = aws.costs(start, end, metric, "MONTHLY", None, build_filter(accounts, [], [], key, [], True))
        amount, untagged = Decimal(total(full)), Decimal(total(missing))
        tagged = amount - untagged
        percent = tagged / amount * 100 if amount > 0 and 0 <= tagged <= amount else None
        return {"total": str(amount), "untagged": str(untagged), "tagged": str(tagged), "percent": str(percent) if percent is not None else None, "estimated": any(p["estimated"] for p in full), "key": key}
    return cached("coverage", [str(start), str(end), key, metric, accounts], load, refresh)


def csv_response(rows, filename):
    buf = io.StringIO(newline="")
    writer = csv.writer(buf)
    for row in rows:
        # Prevent spreadsheet formula execution from account names and AWS tag values.
        writer.writerow(["'" + v if isinstance(v, str) and v.lstrip().startswith(("=", "+", "@", "-")) and not is_number(v) else v for v in row])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def is_number(value):
    try:
        Decimal(value)
        return True
    except Exception:
        return False


@app.get("/api/export/accounts")
def export_accounts(metric: str = "UnblendedCost", search: str = ""):
    result = account_report(metric)["data"]
    rows = [["Account ID", "Name", "State", "Previous month USD", "Current month USD", "Comparable previous period USD", "Metric", "Current end exclusive", "Current month estimated"]]
    rows += [[r["id"], r["name"], r["state"], r["previous"], r["current"], r["comparable"], metric, result["end"], result["estimated"]] for r in result["accounts"] if search.lower() in (r["name"] + r["id"]).lower()]
    return csv_response(rows, "aws-accounts.csv")


@app.get("/api/export/costs")
def export_costs(start: date, end: date, metric: str = "UnblendedCost", granularity: str = "MONTHLY", group: str = "LINKED_ACCOUNT", accounts: list[str] = Query(default=[]), services: list[str] = Query(default=[]), regions: list[str] = Query(default=[]), tag_key: str = "", tag_values: list[str] = Query(default=[]), absent: bool = False):
    result = query_data(start, end, metric, granularity, group, accounts, services, regions, tag_key, tag_values, absent, False)["data"]
    rows = [["Start", "End exclusive", group, "Amount", "Currency", "Metric", "Estimated"]]
    rows += [[p["start"], p["end"], g["keys"][0], g["amount"], "USD", metric, p["estimated"]] for p in result["periods"] for g in p["groups"]]
    return csv_response(rows, "aws-costs.csv")


if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
