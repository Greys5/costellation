"""Read-only organization billing adapter. All money stays decimal until display."""
import calendar
from datetime import date
from decimal import Decimal
from threading import Lock

import boto3
from botocore.config import Config

METRICS = {"UnblendedCost", "AmortizedCost"}


def month_shift(value: date, months: int) -> date:
    index = value.year * 12 + value.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(value.day, calendar.monthrange(year, month + 1)[1]))


def comparison_window(start: date, end: date):
    previous = month_shift(start, -1)
    if start.day == 1 and end == month_shift(start, 1):
        return previous, start
    from datetime import timedelta
    return previous, min(previous + (end - start), start) if start.day == 1 else previous + timedelta(days=(end - start).days)


def validate_window(start: date, end: date, today: date):
    if end <= start:
        raise ValueError("End must be after start (end date is exclusive).")
    if end > today:
        raise ValueError("End must be today or earlier; current-day costs are excluded.")
    if start < month_shift(today.replace(day=1), -12):
        raise ValueError("Choose a date within the last 12 completed months.")


def build_filter(accounts, services, regions, tag_key, tag_values, absent):
    clauses = []
    for key, values in [("LINKED_ACCOUNT", accounts), ("SERVICE", services), ("REGION", regions)]:
        if values:
            clauses.append({"Dimensions": {"Key": key, "Values": values}})
    if tag_key and absent:
        clauses.append({"Tags": {"Key": tag_key, "MatchOptions": ["ABSENT"]}})
    elif tag_key and tag_values:
        clauses.append({"Tags": {"Key": tag_key, "Values": tag_values}})
    return {"And": clauses} if len(clauses) > 1 else clauses[0] if clauses else None


def merge_pages(pages, metric):
    periods = {}
    for page in pages:
        for row in page.get("ResultsByTime", []):
            window = row["TimePeriod"]
            item = periods.setdefault(window["Start"], {"start": window["Start"], "end": window["End"], "estimated": False, "groups": [], "total": "0"})
            item["estimated"] |= row.get("Estimated", False)
            for group in row.get("Groups", []):
                value = group["Metrics"][metric]
                if value["Unit"] != "USD":
                    raise ValueError("Unsupported billing currency: " + value["Unit"])
                item["groups"].append({"keys": group["Keys"], "amount": value["Amount"]})
            if not row.get("Groups") and metric in row.get("Total", {}):
                value = row["Total"][metric]
                if value["Unit"] != "USD":
                    raise ValueError("Unsupported billing currency: " + value["Unit"])
                item["total"] = str(Decimal(item["total"]) + Decimal(value["Amount"]))
    for row in periods.values():
        if row["groups"]:
            row["total"] = str(sum((Decimal(g["amount"]) for g in row["groups"]), Decimal(0)))
    return sorted(periods.values(), key=lambda p: p["start"])


def summarize_accounts(accounts, periods):
    result = {a["Id"]: {"id": a["Id"], "name": a["Name"], "state": a.get("State", a.get("Status", "UNKNOWN")), "amount": "0"} for a in accounts}
    for period in periods:
        for group in period["groups"]:
            key = group["keys"][0]
            row = result.setdefault(key, {"id": key, "name": "Historical account " + key, "state": "HISTORICAL", "amount": "0"})
            row["amount"] = str(Decimal(row["amount"]) + Decimal(group["amount"]))
    return sorted(result.values(), key=lambda r: Decimal(r["amount"]), reverse=True)


class AWS:
    def __init__(self, profile="default"):
        self.profile = profile
        self._clients = None
        self._lock = Lock()

    def clients(self):
        with self._lock:
            if self._clients is None:
                session = boto3.Session(profile_name=self.profile)
                config = Config(retries={"mode": "adaptive", "max_attempts": 6}, connect_timeout=10, read_timeout=60)
                self._clients = {name: session.client(name, region_name="us-east-1", config=config) for name in ["organizations", "ce", "sts"]}
            return self._clients

    def pages(self, service, operation, **kwargs):
        client = self.clients()[service]
        while True:
            response = getattr(client, operation)(**kwargs)
            yield response
            token = response.get("NextPageToken") if service == "ce" else response.get("NextToken")
            if not token:
                break
            kwargs["NextPageToken" if service == "ce" else "NextToken"] = token

    def identity(self):
        result = self.clients()["sts"].get_caller_identity()
        org = self.clients()["organizations"].describe_organization()["Organization"]
        return {"account": result["Account"], "management_account": org["MasterAccountId"], "profile": self.profile}

    def accounts(self):
        return [{k: a[k] for k in ["Id", "Name", "State"] if k in a} for p in self.pages("organizations", "list_accounts") for a in p["Accounts"]]

    def tags(self):
        return [t for p in self.pages("ce", "list_cost_allocation_tags") for t in p.get("CostAllocationTags", [])]

    def costs(self, start, end, metric="UnblendedCost", granularity="MONTHLY", group="LINKED_ACCOUNT", filters=None):
        args = {"TimePeriod": {"Start": str(start), "End": str(end)}, "Granularity": granularity, "Metrics": [metric]}
        if group:
            args["GroupBy"] = [{"Type": "DIMENSION", "Key": group}]
        if filters:
            args["Filter"] = filters
        return merge_pages(self.pages("ce", "get_cost_and_usage", **args), metric)

    def costs_by_tag(self, start, end, metric, group, tag_key, filters=None):
        args = {"TimePeriod": {"Start": str(start), "End": str(end)}, "Granularity": "MONTHLY", "Metrics": [metric],
                "GroupBy": [{"Type": "DIMENSION", "Key": group}, {"Type": "TAG", "Key": tag_key}]}
        if filters:
            args["Filter"] = filters
        return merge_pages(self.pages("ce", "get_cost_and_usage", **args), metric)

    def dimensions(self, start, end, dimension):
        return sorted({v["Value"] for p in self.pages("ce", "get_dimension_values", TimePeriod={"Start": str(start), "End": str(end)}, Dimension=dimension, Context="COST_AND_USAGE") for v in p.get("DimensionValues", [])})

    def tag_values(self, start, end, key):
        return sorted({v for p in self.pages("ce", "get_tags", TimePeriod={"Start": str(start), "End": str(end)}, TagKey=key) for v in p.get("Tags", [])})
