import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  ExternalLink,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { useData } from "./useData";
import { selectActiveTag } from "./tagSelection";

type Account = { Id: string; Name: string; State: string };
type AllocationTag = { TagKey: string; Status: string; Type: string };
type Options = {
  accounts: Account[];
  tags: AllocationTag[];
  services: string[];
  regions: string[];
  earliest: string;
  today: string;
};
type Report = {
  accounts: {
    id: string;
    name: string;
    state: string;
    previous: string;
    current: string;
    comparable: string;
  }[];
  previous_total: string;
  current_total: string;
  comparable_total: string;
  previous_start: string;
  current_start: string;
  end: string;
  estimated: boolean;
};
type Costs = {
  periods: {
    start: string;
    end: string;
    estimated: boolean;
    total: string;
    groups: { keys: string[]; amount: string }[];
  }[];
  groups: { key: string; amount: string }[];
  total: string;
  estimated: boolean;
  metric: string;
  currency: string;
  start: string;
  end: string;
  group: string;
};
type Coverage = {
  total: string;
  untagged: string;
  tagged: string;
  percent: string | null;
  estimated: boolean;
  key: string;
};
type Page = "Overview" | "Accounts" | "Cost Explorer" | "Tags";
const money = (v: string | number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Number(v));
const month = (s: string) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const pct = (a: string, b: string) =>
  Number(b) > 0 ? ((Number(a) - Number(b)) / Number(b)) * 100 : null;
function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" size={25} />
      <h3>Reading your AWS costs</h3>
      <p>Fresh queries can take a moment. Results are cached locally.</p>
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      <strong>We couldn’t load this report.</strong>
      <span>{message}</span>
    </div>
  );
}
function Change({ a, b }: { a: string; b: string }) {
  const v = pct(a, b);
  return v === null ? (
    <span className="muted">No comparable spend</span>
  ) : (
    <span
      title="Compared with the equivalent elapsed period in the previous month"
      className={"change " + (v > 0 ? "up" : "down")}
    >
      {v > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{" "}
      {Math.abs(v).toFixed(1)}% <span>vs. prior period</span>
    </span>
  );
}
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <details className="multi">
      <summary>
        <span>
          {label}
          {selected.length > 0 && <b>{selected.length}</b>}
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="dropdown">
        <input
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="text-button" onClick={() => onChange([])}>
          Clear selection
        </button>
        <div className="choices">
          {options
            .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
            .map((o) => (
              <label key={o.value}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() =>
                    onChange(
                      selected.includes(o.value)
                        ? selected.filter((v) => v !== o.value)
                        : [...selected, o.value],
                    )
                  }
                />
                <span>{o.label}</span>
              </label>
            ))}
        </div>
      </div>
    </details>
  );
}
function Trend({ data, daily = false }: { data: Costs; daily?: boolean }) {
  const rows = data.periods.map((p) => ({
    date: p.start,
    cost: Number(p.total),
  }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={270}>
        <AreaChart
          data={rows}
          margin={{ top: 15, right: 18, left: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8370d8" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#8370d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e9e7f1"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(s) =>
              daily
                ? s.slice(5)
                : new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  })
            }
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8f8ca1", fontSize: 11 }}
            minTickGap={25}
            dy={10}
          />
          <YAxis
            tickFormatter={(v) => money(v, true)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#8f8ca1", fontSize: 11 }}
            width={65}
          />
          <Tooltip
            formatter={(v) => [money(Number(v)), "Cost"]}
            labelFormatter={(s) => String(s)}
            contentStyle={{
              border: "1px solid #e5e1ef",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="cost"
            stroke="#8270d0"
            strokeWidth={2.5}
            fill="url(#costFill)"
            dot={false}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function Breakdown({
  groups,
  names,
  onSelect,
}: {
  groups: Costs["groups"];
  names?: Record<string, string>;
  onSelect?: (key: string) => void;
}) {
  const top = groups.slice(0, 7),
    max = Math.max(...top.map((g) => Math.abs(Number(g.amount))), 1);
  return (
    <div className="breakdown">
      {top.map((g, i) => (
        <button
          key={g.key}
          className="break-row"
          disabled={!onSelect}
          onClick={() => onSelect?.(g.key)}
        >
          <div>
            <span>
              <i className={"dot dot-" + i} />
              {names?.[g.key] || g.key || "No region"}
            </span>
            <strong>{money(g.amount)}</strong>
          </div>
          <div className="bar-track">
            <i
              style={{ width: `${(Math.abs(Number(g.amount)) / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
      {groups.length === 0 && (
        <p className="muted">No spending in this selection.</p>
      )}
    </div>
  );
}
function CardHead({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-head">
      <div>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      {children}
    </div>
  );
}

export function CostellationPage() {
  const [page, setPage] = useState<Page>("Overview"),
    [revision, setRevision] = useState(0),
    [metric, setMetric] = useState("UnblendedCost");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const opts = useData<Options>("/api/options", revision),
    status = useData<{
      account: string;
      management_account: string;
      profile: string;
    }>("/api/status", revision);
  const report = useData<Report>("/api/accounts?metric=" + metric, revision);
  const [search, setSearch] = useState(""),
    [accounts, setAccounts] = useState<string[]>([]),
    [services, setServices] = useState<string[]>([]),
    [regions, setRegions] = useState<string[]>([]),
    [tagKey, setTagKey] = useState(""),
    [tagValues, setTagValues] = useState<string[]>([]),
    [absent, setAbsent] = useState(false),
    [group, setGroup] = useState("LINKED_ACCOUNT"),
    [granularity, setGranularity] = useState("MONTHLY");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [coverageKey, setCoverageKey] = useState("");
  useEffect(() => {
    if (opts.result) {
      setStart((v) => v || opts.result!.data.earliest);
      setEnd((v) => v || opts.result!.data.today);
    }
  }, [opts.result]);
  const options = opts.result?.data;
  const names = useMemo(
    () =>
      Object.fromEntries((options?.accounts || []).map((a) => [a.Id, a.Name])),
    [options],
  );
  const active = options?.tags.filter((t) => t.Status === "Active") || [];
  useEffect(() => {
    if (options) setCoverageKey((key) => selectActiveTag(key, options.tags));
  }, [options]);
  const values = useData<string[]>(
    tagKey ? "/api/tag-values?key=" + encodeURIComponent(tagKey) : null,
  );
  const params = useMemo(() => {
    const p = new URLSearchParams({ start, end, metric, group, granularity });
    accounts.forEach((v) => p.append("accounts", v));
    services.forEach((v) => p.append("services", v));
    regions.forEach((v) => p.append("regions", v));
    if (tagKey) {
      p.set("tag_key", tagKey);
      tagValues.forEach((v) => p.append("tag_values", v));
      if (absent) p.set("absent", "true");
    }
    return p;
  }, [
    start,
    end,
    metric,
    group,
    granularity,
    accounts,
    services,
    regions,
    tagKey,
    tagValues,
    absent,
  ]);
  const explorer = useData<Costs>(
    page === "Cost Explorer" && start && end ? "/api/costs?" + params : null,
    revision,
  );
  const trend = useData<Costs>(
    page === "Overview" && options
      ? "/api/costs?" +
          new URLSearchParams({
            start: options.earliest,
            end: options.today,
            metric,
            group: "LINKED_ACCOUNT",
            granularity: "MONTHLY",
          })
      : null,
    revision,
  );
  const serviceData = useData<Costs>(
    page === "Overview" && report.result
      ? "/api/costs?" +
          new URLSearchParams({
            start: report.result.data.previous_start,
            end: report.result.data.current_start,
            metric,
            group: "SERVICE",
          })
      : null,
    revision,
  );
  const coverageParams = new URLSearchParams({
    start: report.result?.data.previous_start || "",
    end: report.result?.data.current_start || "",
    key: coverageKey,
    metric,
  });
  const coverage = useData<Coverage>(
    page === "Tags" &&
      report.result &&
      active.some((t) => t.TagKey === coverageKey)
      ? "/api/coverage?" + coverageParams
      : null,
    revision,
  );
  const [tagSearch, setTagSearch] = useState(""),
    [tagStatus, setTagStatus] = useState("All");
  const rows =
    report.result?.data.accounts.filter((a) =>
      (a.name + a.id).toLowerCase().includes(search.toLowerCase()),
    ) || [];
  function drill(id: string) {
    setAccounts([id]);
    setServices([]);
    setRegions([]);
    setTagKey("");
    setTagValues([]);
    setAbsent(false);
    if (report.result) {
      setStart(report.result.data.previous_start);
      setEnd(report.result.data.current_start);
    }
    setGroup("SERVICE");
    setGranularity("MONTHLY");
    setPage("Cost Explorer");
  }
  const titles: Record<Page, string> = {
    Overview: "Connect the dots in your cloud spend.",
    Accounts: "Every account in your orbit.",
    "Cost Explorer": "Discover the patterns behind your spend.",
    Tags: "Connect spend to purpose.",
  };
  const subtitles: Record<Page, string> = {
    Overview: "One connected view of your accounts, costs, and allocation.",
    Accounts:
      "Map every account to its spending and place in your organization.",
    "Cost Explorer":
      "Explore the services, accounts, and tags behind your AWS bill.",
    Tags: "Connect accounts, applications, and teams through cost allocation.",
  };
  const current = report.result?.data;
  const busy =
    opts.loading ||
    report.loading ||
    explorer.loading ||
    trend.loading ||
    serviceData.loading ||
    coverage.loading;
  const stamps = [
    opts.result,
    report.result,
    explorer.result,
    trend.result,
    serviceData.result,
    coverage.result,
  ]
    .filter(Boolean)
    .map((r) => r!.meta.retrieved_at)
    .sort();
  const filtersActive =
    accounts.length + services.length + regions.length + (tagKey ? 1 : 0);
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          aria-label="Costellation overview"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-icon">
            <svg
              width="30"
              height="30"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 23L12 10L23 6L27 20L17 25L12 10M5 23L17 25L23 6"
                stroke="currentColor"
                strokeWidth="1.15"
                strokeOpacity=".55"
              />
              <circle cx="5" cy="23" r="2" fill="currentColor" />
              <circle cx="12" cy="10" r="2.6" fill="currentColor" />
              <circle cx="27" cy="20" r="1.8" fill="currentColor" />
              <circle cx="17" cy="25" r="2" fill="currentColor" />
              <path
                d="M23 1L24.3 4.7L28 6L24.3 7.3L23 11L21.7 7.3L18 6L21.7 4.7Z"
                fill="#e8e0ff"
              />
            </svg>
          </span>
          costellation
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={16} />
          </span>
          <div>
            <strong>
              {names[status.result?.data.management_account || ""] ||
                "AWS organization"}
            </strong>
            <small>AWS organization</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {(
            [
              { name: "Overview", icon: LayoutDashboard },
              { name: "Accounts", icon: Building2 },
              { name: "Cost Explorer", icon: SlidersHorizontal },
              { name: "Tags", icon: Tag },
            ] as const
          ).map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              {name}
              {name === "Accounts" && options && (
                <span className="nav-count">{options.accounts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className={"live-dot " + (status.result ? "" : "offline")} />
            <div>
              <strong>
                {status.result
                  ? "AWS connected"
                  : status.error
                    ? "Connection unavailable"
                    : "Connecting to AWS"}
              </strong>
              <small>
                {status.result
                  ? `${status.result.data.profile} · ${status.result.data.account}`
                  : "Using your local SSO session"}
              </small>
            </div>
          </div>
          <div className="local-badge">
            <ShieldCheck size={14} />
            Local workspace · Read only
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <span className="crumb">/</span> <strong>{page}</strong>
          </span>
          <div className="top-right">
            <span className="org-pill">
              <span className="live-dot" />
              AWS ORGANIZATION
            </span>
            <span className="avatar">AWS</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                YOUR COSTELLATION <span>/</span> {page.toUpperCase()}
              </div>
              <h1>{titles[page]}</h1>
              <p>{subtitles[page]}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setRevision((v) => v + 1)}
              >
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                Refresh
              </button>
              {page !== "Tags" && (
                <a
                  className="button primary"
                  href={
                    page === "Cost Explorer"
                      ? "/api/export/costs?" + params
                      : "/api/export/accounts?" +
                        new URLSearchParams({
                          metric,
                          search: page === "Accounts" ? search : "",
                        })
                  }
                >
                  <Download size={15} />
                  Export CSV
                </a>
              )}
            </div>
          </div>
          <div className="context-strip">
            <div>
              <span className="live-dot" />{" "}
              {options
                ? `${options.accounts.length} organization accounts`
                : "Connecting to organization"}
              <span className="context-divider" />
              USD
              <span className="context-divider" />
              {stamps.length
                ? `Oldest retrieval ${new Date(stamps[0]).toLocaleString()}`
                : "Waiting for AWS data"}
            </div>
            <label className="metric-select">
              <span>Cost basis</span>
              <select
                aria-label="Cost basis"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
              >
                <option value="UnblendedCost">Unblended cost</option>
                <option value="AmortizedCost">Amortized cost</option>
              </select>
            </label>
          </div>
          {status.error && <ErrorBox message={status.error} />}
          {opts.error && <ErrorBox message={opts.error} />}
          {report.error && <ErrorBox message={report.error} />}
          {page === "Overview" && (
            <>
              {report.loading && <Loading />}
              {current && (
                <>
                  <div className="stats">
                    <div className="stat">
                      <div className="stat-label">
                        Previous month <CircleDollarSign size={17} />
                      </div>
                      <strong>{money(current.previous_total)}</strong>
                      <span className="stat-note">
                        {month(current.previous_start)} · complete month
                      </span>
                    </div>
                    <div className="stat">
                      <div className="stat-label">
                        Month to date <ArrowUpRight size={17} />
                      </div>
                      <strong>
                        {money(current.current_total)}
                        {current.estimated && <b className="estimated">EST.</b>}
                      </strong>
                      <Change
                        a={current.current_total}
                        b={current.comparable_total}
                      />
                    </div>
                    <div className="stat">
                      <div className="stat-label">
                        Organization accounts <Building2 size={17} />
                      </div>
                      <strong>
                        {options?.accounts.length ?? "—"}
                        <small> accounts</small>
                      </strong>
                      <span className="stat-note">
                        {options?.accounts.filter((a) => a.State === "ACTIVE")
                          .length ?? "—"}{" "}
                        active in AWS Organizations
                      </span>
                    </div>
                    <div className="stat accent-stat">
                      <div className="stat-label">
                        Active cost tags <Tag size={17} />
                      </div>
                      <strong>
                        {active.length}
                        <small> / {options?.tags.length ?? "—"}</small>
                      </strong>
                      <button
                        className="stat-link"
                        onClick={() => setPage("Tags")}
                      >
                        Review allocation gaps <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <section className="card trend-card">
                    <CardHead
                      title="Spending over time"
                      note="12 completed months + current month · current month is partial"
                    >
                      <span className="legend">
                        <i />
                        Total cost
                      </span>
                    </CardHead>
                    {trend.loading ? (
                      <Loading />
                    ) : trend.error ? (
                      <ErrorBox message={trend.error} />
                    ) : (
                      trend.result && <Trend data={trend.result.data} />
                    )}
                    <div className="chart-foot">
                      <ShieldCheck size={13} />
                      Reconciled against AWS Cost Explorer totals
                      <span>
                        {metric === "UnblendedCost" ? "Unblended" : "Amortized"}{" "}
                        · USD
                      </span>
                    </div>
                  </section>
                  <div className="two-col">
                    <section className="card">
                      <CardHead
                        title="Where your spend lives"
                        note={`${month(current.previous_start)} · top accounts`}
                      >
                        <button
                          className="text-button"
                          onClick={() => setPage("Accounts")}
                        >
                          View all <ArrowRight size={13} />
                        </button>
                      </CardHead>
                      <Breakdown
                        groups={current.accounts.map((a) => ({
                          key: a.id,
                          amount: a.previous,
                        }))}
                        names={names}
                        onSelect={drill}
                      />
                    </section>
                    <section className="card">
                      <CardHead
                        title="Services at a glance"
                        note={`${month(current.previous_start)} · top AWS services`}
                      />
                      {serviceData.loading ? (
                        <Loading />
                      ) : serviceData.error ? (
                        <ErrorBox message={serviceData.error} />
                      ) : (
                        serviceData.result && (
                          <Breakdown groups={serviceData.result.data.groups} />
                        )
                      )}
                    </section>
                  </div>
                  <div className="insight">
                    <div className="insight-icon">
                      <Tag size={20} />
                    </div>
                    <div>
                      <strong>Connect more of your cost constellation.</strong>
                      <p>
                        {active.length} allocation tags are active. Review
                        missing attribution before defining new tag standards.
                      </p>
                    </div>
                    <button className="button" onClick={() => setPage("Tags")}>
                      Explore tags <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {page === "Accounts" && (
            <>
              <section className="card">
                <CardHead
                  title="Account directory"
                  note={
                    current
                      ? `${month(current.previous_start)} and current month through ${current.end} (exclusive)${current.estimated ? " · current month estimated" : ""}`
                      : "Loading spending periods"
                  }
                >
                  <div className="search">
                    <Search size={15} />
                    <input
                      aria-label="Search accounts"
                      placeholder="Search account name or ID…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </CardHead>
                {report.loading ? (
                  <Loading />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>ACCOUNT</th>
                          <th>STATUS</th>
                          <th className="num">PREVIOUS MONTH</th>
                          <th className="num">MONTH TO DATE</th>
                          <th>MTD CHANGE</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <button
                                className="account-name"
                                onClick={() => drill(a.id)}
                              >
                                <span className="account-icon">
                                  <Building2 size={16} />
                                </span>
                                <span>
                                  <strong>{a.name}</strong>
                                  <small>
                                    {a.id}
                                    {a.id ===
                                    status.result?.data.management_account
                                      ? " · Management"
                                      : ""}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span
                                className={
                                  "status " +
                                  (a.state === "ACTIVE" ? "green" : "")
                                }
                              >
                                {a.state}
                              </span>
                            </td>
                            <td className="num amount">{money(a.previous)}</td>
                            <td className="num amount">{money(a.current)}</td>
                            <td>
                              <Change a={a.current} b={a.comparable} />
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Explore ${a.name}`}
                                onClick={() => drill(a.id)}
                              >
                                <ArrowUpRight size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <div className="empty">No matching accounts.</div>
                    )}
                  </div>
                )}
                <div className="table-foot">
                  {rows.length} accounts shown{" "}
                  <span>
                    Zero-cost accounts included · historical accounts retained
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "Cost Explorer" && (
            <>
              <section className="card filters">
                <div className="filter-title">
                  <Filter size={16} />
                  <strong>Explore spending</strong>
                  {filtersActive > 0 && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setAccounts([]);
                        setServices([]);
                        setRegions([]);
                        setTagKey("");
                        setTagValues([]);
                        setAbsent(false);
                      }}
                    >
                      Clear filters <X size={12} />
                    </button>
                  )}
                </div>
                <div className="date-presets">
                  <button
                    onClick={() => {
                      if (options) {
                        setStart(options.earliest);
                        setEnd(options.today);
                        setGranularity("MONTHLY");
                      }
                    }}
                  >
                    12 months + current
                  </button>
                  <button
                    onClick={() => {
                      if (current) {
                        setStart(current.previous_start);
                        setEnd(current.current_start);
                        setGranularity("MONTHLY");
                      }
                    }}
                  >
                    Previous month
                  </button>
                  <button
                    onClick={() => {
                      if (current) {
                        setStart(current.current_start);
                        setEnd(current.end);
                        setGranularity("DAILY");
                      }
                    }}
                  >
                    Current month · daily
                  </button>
                </div>
                <div className="filter-grid">
                  <label>
                    Start date
                    <input
                      type="date"
                      aria-label="Start date"
                      min={options?.earliest}
                      max={end}
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    End date (exclusive)
                    <input
                      type="date"
                      aria-label="End date"
                      min={start}
                      max={options?.today}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                  <label>
                    Group by
                    <select
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    >
                      <option value="LINKED_ACCOUNT">Account</option>
                      <option value="SERVICE">Service</option>
                      <option value="REGION">Region</option>
                    </select>
                  </label>
                  <label>
                    Granularity
                    <select
                      value={granularity}
                      onChange={(e) => setGranularity(e.target.value)}
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="DAILY">Daily</option>
                    </select>
                  </label>
                </div>
                <div className="filter-row">
                  <MultiSelect
                    label="Accounts"
                    options={
                      options?.accounts.map((a) => ({
                        value: a.Id,
                        label: a.Name,
                      })) || []
                    }
                    selected={accounts}
                    onChange={setAccounts}
                  />
                  <MultiSelect
                    label="Services"
                    options={
                      options?.services.map((v) => ({ value: v, label: v })) ||
                      []
                    }
                    selected={services}
                    onChange={setServices}
                  />
                  <MultiSelect
                    label="Regions"
                    options={
                      options?.regions.map((v) => ({
                        value: v,
                        label: v || "No region",
                      })) || []
                    }
                    selected={regions}
                    onChange={setRegions}
                  />
                  <label className="tag-select">
                    <Tag size={14} />
                    <select
                      aria-label="Tag key"
                      value={tagKey}
                      onChange={(e) => {
                        setTagKey(e.target.value);
                        setTagValues([]);
                        setAbsent(false);
                      }}
                    >
                      <option value="">Cost allocation tag</option>
                      {active.map((t) => (
                        <option key={t.TagKey}>{t.TagKey}</option>
                      ))}
                    </select>
                  </label>
                  {tagKey && (
                    <>
                      <MultiSelect
                        label="Tag values"
                        options={(values.result?.data || []).map((v) => ({
                          value: v,
                          label: v || "(empty value)",
                        }))}
                        selected={tagValues}
                        onChange={(v) => {
                          setTagValues(v);
                          setAbsent(false);
                        }}
                      />
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={absent}
                          onChange={(e) => {
                            setAbsent(e.target.checked);
                            setTagValues([]);
                          }}
                        />
                        Missing tag
                      </label>
                    </>
                  )}
                </div>
                {values.error && <ErrorBox message={values.error} />}
                {tagKey && !absent && tagValues.length === 0 && (
                  <p className="filter-note">
                    Select tag values or “Missing tag” to apply the tag filter.
                  </p>
                )}
              </section>
              {explorer.loading ? (
                <Loading />
              ) : explorer.error ? (
                <ErrorBox message={explorer.error} />
              ) : (
                explorer.result && (
                  <>
                    <section className="card trend-card">
                      <CardHead
                        title="Filtered spending"
                        note={`${start} → ${end} (exclusive)`}
                      >
                        <div className="explorer-total">
                          {money(explorer.result.data.total)}
                          {explorer.result.data.estimated && (
                            <b className="estimated">EST.</b>
                          )}
                        </div>
                      </CardHead>
                      <Trend
                        data={explorer.result.data}
                        daily={granularity === "DAILY"}
                      />
                      <div className="chart-foot">
                        <Check size={13} />
                        Grouped costs reconcile with the independent total
                        <span>
                          USD ·{" "}
                          {metric === "UnblendedCost"
                            ? "Unblended"
                            : "Amortized"}
                        </span>
                      </div>
                    </section>
                    <section className="card">
                      <CardHead
                        title={`Cost by ${group === "LINKED_ACCOUNT" ? "account" : group === "SERVICE" ? "service" : "region"}`}
                        note={`${explorer.result.data.groups.length} groups · sorted by cost`}
                      />
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>
                                {group === "LINKED_ACCOUNT"
                                  ? "ACCOUNT"
                                  : group === "SERVICE"
                                    ? "SERVICE"
                                    : "REGION"}
                              </th>
                              <th className="num">COST (USD)</th>
                              <th className="num">SHARE OF NET TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {explorer.result.data.groups.map((g) => (
                              <tr key={g.key}>
                                <td>
                                  <strong>
                                    {group === "LINKED_ACCOUNT"
                                      ? names[g.key] || g.key
                                      : g.key || "No region"}
                                  </strong>
                                  {group === "LINKED_ACCOUNT" && (
                                    <small className="block muted">
                                      {g.key}
                                    </small>
                                  )}
                                </td>
                                <td className="num amount">
                                  {money(g.amount)}
                                </td>
                                <td className="num muted">
                                  {Number(explorer.result!.data.total) > 0
                                    ? (
                                        (Number(g.amount) /
                                          Number(explorer.result!.data.total)) *
                                        100
                                      ).toFixed(1) + "%"
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {explorer.result.data.groups.length === 0 && (
                        <div className="empty">
                          No costs match these filters.
                        </div>
                      )}
                    </section>
                  </>
                )
              )}
            </>
          )}
          {page === "Tags" && (
            <>
              <div className="tag-summary">
                <div className="tag-summary-text">
                  <div className="eyebrow">ALLOCATION HEALTH</div>
                  <h2>
                    Connect every cost
                    <br />
                    to its place in your business.
                  </h2>
                  <p>
                    Use existing allocation keys to understand spending.
                    <br />
                    Inactive tags cannot filter billing costs.
                  </p>
                </div>
                <div className="tag-numbers">
                  <div>
                    <strong>{active.length}</strong>
                    <span>
                      <i className="live-dot" />
                      Active
                    </span>
                  </div>
                  <div>
                    <strong>
                      {options?.tags.filter((t) => t.Status !== "Active")
                        .length ?? "—"}
                    </strong>
                    <span>
                      <i className="live-dot grey" />
                      Inactive
                    </span>
                  </div>
                </div>
              </div>
              <div className="two-col">
                <section className="card">
                  <CardHead
                    title="Cost allocation coverage"
                    note={
                      current
                        ? `${month(current.previous_start)} · organization-wide`
                        : ""
                    }
                  >
                    <select
                      aria-label="Coverage tag"
                      value={coverageKey}
                      onChange={(e) => setCoverageKey(e.target.value)}
                    >
                      {active.map((t) => (
                        <option key={t.TagKey}>{t.TagKey}</option>
                      ))}
                    </select>
                  </CardHead>
                  {coverage.loading ? (
                    <Loading />
                  ) : coverage.error ? (
                    <ErrorBox message={coverage.error} />
                  ) : coverage.result ? (
                    <div className="coverage">
                      <div className="coverage-value">
                        {coverage.result.data.percent === null
                          ? "—"
                          : Number(coverage.result.data.percent).toFixed(1) +
                            "%"}
                        <span>
                          of net cost allocated
                          {coverage.result.data.estimated ? " · estimated" : ""}
                        </span>
                      </div>
                      <div className="coverage-bar">
                        <i
                          style={{
                            width: `${coverage.result.data.percent === null ? 0 : Math.max(0, Math.min(100, Number(coverage.result.data.percent)))}%`,
                          }}
                        />
                      </div>
                      <div className="coverage-legend">
                        <span>
                          <i className="live-dot" />
                          Tagged{" "}
                          <strong>{money(coverage.result.data.tagged)}</strong>
                        </span>
                        <span>
                          <i className="live-dot grey" />
                          Missing tag{" "}
                          <strong>
                            {money(coverage.result.data.untagged)}
                          </strong>
                        </span>
                      </div>
                      <p>
                        Measures cost attribution, not resource compliance.
                        Negative charges can make a percentage unsuitable; in
                        that case only amounts are shown.
                      </p>
                    </div>
                  ) : (
                    <div className="empty">
                      No active allocation tags available.
                    </div>
                  )}
                </section>
                <section className="card standards">
                  <CardHead
                    title="Suggested tagging standard"
                    note="Recommendation for review · no AWS changes"
                  />
                  {[
                    {
                      name: "Environment",
                      keys: [
                        "environment_cost_allocation",
                        "environment",
                        "Environment",
                        "env",
                        "Env",
                      ],
                      desc: "Production, staging, development, sandbox",
                    },
                    {
                      name: "Application",
                      keys: [
                        "Application",
                        "application",
                        "project",
                        "Project",
                      ],
                      desc: "The product or application that owns the spend",
                    },
                    {
                      name: "Team",
                      keys: ["team", "Team", "Owner", "owner"],
                      desc: "An accountable team, rather than a person",
                    },
                    {
                      name: "Cost center",
                      keys: ["CostCenter", "cost-center", "cost_center"],
                      desc: "The Finance allocation or business unit",
                    },
                  ].map((s) => {
                    const found =
                      options?.tags.filter((t) => s.keys.includes(t.TagKey)) ||
                      [];
                    return (
                      <div className="standard" key={s.name}>
                        <span className="standard-icon">
                          <Tag size={15} />
                        </span>
                        <div>
                          <strong>{s.name}</strong>
                          <p>{s.desc}</p>
                          <small>
                            {found.length
                              ? "Existing candidates: " +
                                found.map((t) => t.TagKey).join(", ")
                              : "No matching allocation key discovered"}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                  <p className="standard-note">
                    Review values and ownership before choosing a canonical key.
                    Preserve case differences until a migration is approved.
                  </p>
                </section>
              </div>
              <section className="card">
                <CardHead
                  title="Allocation tag inventory"
                  note="Billing-discovered tag keys and their activation state"
                >
                  <div className="tag-controls">
                    <select
                      aria-label="Tag status"
                      value={tagStatus}
                      onChange={(e) => setTagStatus(e.target.value)}
                    >
                      <option>All</option>
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                    <div className="search">
                      <Search size={15} />
                      <input
                        aria-label="Search tags"
                        placeholder="Search tag keys…"
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHead>
                <div className="table-scroll tag-table">
                  <table>
                    <thead>
                      <tr>
                        <th>TAG KEY</th>
                        <th>STATUS</th>
                        <th>TYPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options?.tags
                        .filter(
                          (t) =>
                            t.TagKey.toLowerCase().includes(
                              tagSearch.toLowerCase(),
                            ) &&
                            (tagStatus === "All" || t.Status === tagStatus),
                        )
                        .sort(
                          (a, b) =>
                            (a.Status === "Active" ? 0 : 1) -
                              (b.Status === "Active" ? 0 : 1) ||
                            a.TagKey.localeCompare(b.TagKey),
                        )
                        .map((t) => (
                          <tr key={t.TagKey}>
                            <td>
                              <code>{t.TagKey}</code>
                            </td>
                            <td>
                              <span
                                className={
                                  "status " +
                                  (t.Status === "Active" ? "green" : "")
                                }
                              >
                                {t.Status}
                              </span>
                            </td>
                            <td className="muted">
                              {t.Type === "UserDefined"
                                ? "User defined"
                                : "AWS generated"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} />
              Read-only AWS data · Local SSO session
            </span>
            <span>
              Current-day costs excluded · Cached for up to 24 hours{" "}
              <a
                href="https://console.aws.amazon.com/costmanagement/home#/cost-explorer"
                target="_blank"
                rel="noreferrer"
                aria-label="Open AWS Cost Explorer"
              >
                <ExternalLink size={12} />
              </a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
