"use client";
const NotificationSettings = dynamic(() => import("./notification-settings"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
import MyWork from "./my-work";
import GlobalSearch from "./global-search";
const SearchPage = dynamic(() => import("./searchpage"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
const AuditLog = dynamic(() => import("./auditlog"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
const Reports = dynamic(() => import("./reports"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
const Alerts = dynamic(() => import("./alerts"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
import Grants from "./grants";
const Matching = dynamic(() => import("./matching"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
const Programmes = dynamic(() => import("./programmes"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
import { sourceFields } from "@/lib/programme-source";
import Profile from "./profile";
import People from "./people";
const Overview = dynamic(() => import("./overview"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrivateCache } from "@/lib/private-cache";
import { setClientScope } from "@/lib/client-http";
import { WorkspaceCacheContext } from "./workspace-cache";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  CalendarDays,
  ScanSearch,
  HandCoins,
  Bell,
  Upload,
  ChartNoAxesCombined,
  History,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  RefreshCw,
} from "lucide-react";
import { Data, Person, Programme, Grant, label } from "@/lib/types";
import { can, today } from "@/lib/domain";
import { Table, Editor, Badge, LoadingSkeleton } from "./ui";
import {
  personFields,
  personValues,
  programmeFields,
  programmeValues,
  grantFields,
  grantValues,
  alertFields,
  userFields,
} from "./fields";
import { Editing, request, RequestError } from "./common";
import Login from "./login";
import ImportHistory from "./import-history";
const ImportWizard = dynamic(() => import("./import-wizard"), {
  loading: () => (
    <p className="inline-progress" role="status">
      Opening workspace...
    </p>
  ),
});
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["my-work", "My Tasks", Users],
  ["members", "Caregivers", Users],
  ["care-recipients", "Care Recipients", HeartHandshake],
  ["grants", "Grants & Referrals", HandCoins],
  ["programmes", "Programmes", CalendarDays],
  ["matching", "Programme Matching", ScanSearch],
  ["alerts", "Alerts", Bell],
  ["import", "Import Data", Upload],
  ["reports", "Reports", ChartNoAxesCombined],
  ["audit", "Audit Log", History],
  ["settings", "Settings", Settings],
] as const;
type User = { id: string; name: string; role: string; accessKey: string };
export default function DashboardApp({
  children,
}: {
  children?: React.ReactNode;
}) {
  const pathname = usePathname(),
    segments = pathname.split("/").filter(Boolean),
    requestedSection = segments[0] || "dashboard",
    requestedId = segments[1] || "",
    requestedKey = `${requestedSection}:${requestedId}`;
  const [view, setView] = useState({
    section: requestedSection,
    recordId: requestedId,
  });
  const section = view.section,
    recordId = view.recordId;
  const [refreshing, setRefreshing] = useState(false),
    [revision, setRevision] = useState(0),
    [preparing, setPreparing] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const [cache] = useState(() => new PrivateCache());
  const sequence = useRef(0),
    scopeRef = useRef(""),
    routeRef = useRef({
      section: requestedSection,
      recordId: requestedId,
      key: requestedKey,
    });
  useEffect(() => {
    routeRef.current = {
      section: requestedSection,
      recordId: requestedId,
      key: requestedKey,
    };
  }, [requestedSection, requestedId, requestedKey]);
  const [auth, setAuth] = useState<{
      user: User | null;
      setup: boolean;
      setupRequiresToken?: boolean;
      hosted?: boolean;
    } | null>(null),
    [data, setData] = useState<Data | null>(null),
    [dataSection, setDataSection] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [edit, setEdit] = useState<Editing | null>(null),
    [menu, setMenu] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!menu) return;
    const first = document.querySelector<HTMLAnchorElement>(
      "#workspace-navigation a",
    );
    first?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        document
          .querySelector<HTMLButtonElement>('[aria-label="Toggle navigation"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [menu]);

  const endSession = useCallback(() => {
    sequence.current++;
    scopeRef.current = "";
    setClientScope("");
    cache.clear();
    setData(null);
    setDataSection("");
    setEdit(null);
    setNotice("");
    setError("");
    setAuth({ user: null, setup: false });
  }, [cache]);
  const authenticate = useCallback(async () => {
    try {
      const a = await cache.fetch(
        "initial-auth",
        () => request("/api/auth"),
        true,
        0,
      );
      const key = a.user?.accessKey || "";
      cache.setScope(key);
      scopeRef.current = key;
      setClientScope(key);
      setAuth(a);
      if (!a.user) {
        setData(null);
        setEdit(null);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Cannot connect. Retry your session check.",
      );
    }
  }, [cache]);
  const load = useCallback(
    async (force = false) => {
      const target = routeRef.current,
        scope = scopeRef.current,
        token = ++sequence.current;
      if (!scope) return;
      setRefreshing(true);
      try {
        const key = `data:${target.key}`;
        if (force) {
          const family = ["members", "care-recipients"].includes(target.section)
            ? "people"
            : target.section;
          cache.invalidate(
            (k) => k === key || k.startsWith(`resource:${family}`) || (target.section === "dashboard" && k.startsWith("resource:birthdays:")),
          );
          setRevision((v) => v + 1);
        }
        const existing = !force ? cache.get<Data>(key) : undefined;
        if (existing)
          await cache.fetch(
            "permission-check",
            () => request("/api/data?section=access"),
            true,
            0,
          );
        const result =
          existing ??
          (await cache.fetch<Data>(
            key,
            () =>
              request(
                `/api/data?section=${encodeURIComponent(target.section)}&id=${encodeURIComponent(target.recordId)}`,
              ),
            force,
          ));
        if (token !== sequence.current || scope !== scopeRef.current) return;
        setData(result);
        setView({ section: target.section, recordId: target.recordId });
        setDataSection(target.key);
        setError("");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (e instanceof RequestError && e.status === 401) {
          endSession();
          return;
        }
        if (token === sequence.current)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to refresh this page. Retry.",
          );
      } finally {
        if (token === sequence.current) setRefreshing(false);
      }
    },
    [cache, endSession],
  );
  useEffect(() => {
    void Promise.resolve().then(authenticate);
    const expired = () => endSession();
    const access = () => {
      endSession();
      void authenticate();
    };
    window.addEventListener("p3h-session-ended", expired);
    window.addEventListener("p3h-access-changed", access);
    return () => {
      window.removeEventListener("p3h-session-ended", expired);
      window.removeEventListener("p3h-access-changed", access);
    };
  }, [authenticate, endSession]);
  useEffect(() => {
    if (auth?.user?.id) void Promise.resolve().then(() => load());
  }, [requestedKey, auth?.user?.id, auth?.user?.accessKey, load]);
  useEffect(() => {
    if (!auth?.user?.id) return;
    const verify = () => {
      if (document.visibilityState === "visible")
        void request("/api/data?section=access").catch((e) => {
          if (!(e instanceof DOMException && e.name === "AbortError"))
            setError(
              "Unable to verify current access. Retry before continuing.",
            );
        });
    };
    window.addEventListener("focus", verify);
    const timer = setInterval(verify, 30000);
    return () => {
      window.removeEventListener("focus", verify);
      clearInterval(timer);
    };
  }, [auth?.user?.id]);
  useEffect(() => {
    if (!auth?.user?.id || !can(auth.user.role, "write")) return;
    let active = true;
    let lastAttempt = 0;
    const check = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastAttempt < 60000
      )
        return;
      lastAttempt = Date.now();
      void request("/api/reminders/check", {})
        .then((result) => {
          if (active && result.changed) {
            cache.invalidate((k) =>
              /data:(dashboard|my-work|alerts)|resource:grants/.test(k),
            );
            if (
              ["dashboard", "my-work", "alerts"].includes(
                routeRef.current.section,
              )
            )
              void load(true);
          }
        })
        .catch(() => {
          if (active)
            setError(
              "Reminder check unavailable. Existing tasks are retained; use Refresh Alerts to retry.",
            );
        });
    };
    check();
    const timer = setInterval(check, 15 * 60000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [auth?.user?.id, auth?.user?.role, cache, load]);
  const invalidate = (action: string) => {
    const people = ["person", "relationship", "unlink"].includes(action);
    cache.invalidate(
      (k) =>
        people ||
        ["user", "userAccess", "staffSettings"].includes(action) ||
        (!k.startsWith("data:members:") &&
          !k.startsWith("data:care-recipients:")),
    );
    setRevision((v) => v + 1);
  };
  const options = async () =>
    cache.fetch<Data>("data:options:", () =>
      request("/api/data?section=options"),
    );
  const openEditor = async (e: Editing) => {
    setPreparing(true);
    try {
      if (["relationship", "participation"].includes(e.action)) {
        const opt = await options();
        e = {
          ...e,
          fields: e.fields.map((f) =>
            f.key === "memberId" || f.key === "recipientId"
              ? {
                  ...f,
                  options: opt.people
                    .filter(
                      (p) =>
                        p.kind ===
                          (f.key === "memberId"
                            ? "Member"
                            : "Care Recipient") && p.status === "Active",
                    )
                    .map((p) => ({ value: p.id, label: label(p) })),
                }
              : f.key === "programmeId"
                ? {
                    ...f,
                    options: [
                      { value: "", label: "Select programme" },
                      ...opt.programmes
                        .filter((p) => p.status === "Active")
                        .map((p) => ({ value: p.id, label: p.name })),
                    ],
                  }
                : f,
          ),
        };
      }
      setEdit(e);
    } finally {
      setPreparing(false);
    }
  };
  const action = async (
    action: string,
    values: Record<string, unknown> = {},
    id?: string,
    version?: string,
  ) => {
    const saved = await request("/api/action", {
      action,
      data: values,
      id,
      version,
    });
    invalidate(action);
    if (action === "person" && !id && saved.result?.id)
      router.push(`/people/${saved.result.id}`);
    else await load(true);
    setNotice("Changes saved.");
  };
  const safeAction = async (
    actionName: string,
    values: Record<string, unknown> = {},
    id?: string,
  ) => {
    setError("");
    try {
      await action(actionName, values, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    }
  };
  if (!auth)
    return (
      <main className="session-check" role="status">
        <strong>P3H staff workspace</strong>
        <p>{error || "Checking secure session…"}</p>
        {error && (
          <button onClick={() => void authenticate()}>
            Retry session check
          </button>
        )}
      </main>
    );
  if (!auth.user)
    return (
      <Login
        setup={auth.setup}
        setupRequiresToken={auth.setupRequiresToken}
        hosted={auth.hosted}
        onDone={authenticate}
      />
    );
  const u = auth.user,
    write = can(u.role, "write");
  const title =
    section === "dashboard"
      ? "P3H Dashboard"
      : section === "people"
        ? "Person profile"
        : (nav.find((n) => n[0] === section)?.[1] ?? "Search");
  const restricted =
    (section === "audit" && !can(u.role, "audit")) ||
    (section === "import" && !write);
  const personEditor = (p?: Person, kind = "Member") =>
    setEdit({
      title: p
        ? `Edit ${label(p)}`
        : kind === "Member"
          ? "Add Caregiver"
          : "Add care recipient",
      fields: [
        ...personFields(p?.kind ?? kind),
        {
          key: "assignedId",
          label: "Assigned staff / Case owner",
          type: "select" as const,
          section: "Overview",
          options: [
            { value: "", label: "Unassigned" },
            ...(data?.staff
              .filter((s) => s.active)
              .map((s) => ({ value: s.id, label: s.name })) ?? []),
          ],
        },
      ].map((f) =>
        [
          "languages",
          "spokenLanguages",
          "understoodLanguages",
          "interests",
          "conditions",
        ].includes(f.key)
          ? {
              ...f,
              type: "chips" as const,
              options: [
                ...new Set([
                  ...(f.key.toLowerCase().includes("language")
                    ? [
                        "English",
                        "Mandarin",
                        "Malay",
                        "Tamil",
                        "Hokkien",
                        "Cantonese",
                      ]
                    : f.key === "interests"
                      ? [
                          "Walking",
                          "Exercise",
                          "Music",
                          "Cooking",
                          "Games",
                          "Arts",
                        ]
                      : [
                          "Dementia",
                          "High Blood Pressure",
                          "Osteoporosis",
                          "Gastritis",
                        ]),
                  ...(data?.people.flatMap((p) =>
                    f.key.toLowerCase().includes("language")
                      ? p.languages.map((l) => l.language.name)
                      : f.key === "interests"
                        ? p.interests.map((i) => i.interest.name)
                        : p.conditions.map((c) => c.condition.name),
                  ) ?? []),
                ]),
              ].map((value) => ({ value, label: value })),
            }
          : f,
      ),
      initial: p ? personValues(p) : { status: "Active" },
      action: "person",
      id: p?.id,
      version: p?.updatedAt,
      extra: { kind: p?.kind ?? kind },
    });
  const programmeEditor = (p?: Programme) =>
    setEdit({
      title: p ? "Edit programme" : "Add programme",
      fields: [
        ...programmeFields.filter(
          (f) => !p?.external || ![...sourceFields, "capacity"].includes(f.key),
        ),
      ].map((f) => ({
        ...f,
        section: ["name", "description", "category", "centre"].includes(f.key)
          ? "Programme"
          : ["languages", "interests", "conditions", "mobility"].includes(f.key)
            ? "Suitability"
            : f.key === "notes"
              ? "Notes"
              : "Schedule & availability",
        ...(["languages", "interests", "conditions"].includes(f.key)
          ? {
              type: "chips" as const,
              options: [
                ...new Set(
                  data?.people.flatMap((p) =>
                    f.key === "languages"
                      ? p.languages.map((l) => l.language.name)
                      : f.key === "interests"
                        ? p.interests.map((i) => i.interest.name)
                        : p.conditions.map((c) => c.condition.name),
                  ) ?? [],
                ),
              ].map((value) => ({ value, label: value })),
            }
          : {}),
      })),
      initial: p
        ? {
            ...programmeValues(p),
            suitabilityReviewed: p.suitabilityReviewed ? "Reviewed" : "Pending",
          }
        : { status: "Active", registrationStatus: "Open", capacity: 0 },
      action: "programme",
      id: p?.id,
      version: p?.updatedAt,
    });
  const grantEditor = async (g?: Grant, personId?: string) => {
    setPreparing(true);
    try {
      const formData = await options();
      setEdit({
        title: g ? "Edit grant / support" : "Add grant / support",
        fields: grantFields(formData),
        initial: g
          ? grantValues(g)
          : {
              status: "Submitted",
              personId: personId ?? "",
              followUpFrequency: "Automatic",
              resolution: "Open",
            },
        action: "grant",
        id: g?.id,
        version: g?.updatedAt,
        confirm: Boolean(g),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open form");
    } finally {
      setPreparing(false);
    }
  };
  const createAlert = async (personId?: string) => {
    setPreparing(true);
    try {
      const formData = await options();
      setEdit({
        title: "Create reminder",
        fields: alertFields(formData),
        initial: {
          priority: "Normal",
          type: "Custom reminder",
          personId: personId ?? "",
        },
        action: "alert",
      });
    } finally {
      setPreparing(false);
    }
  };
  return (
    <WorkspaceCacheContext.Provider value={cache}>
      <div
        className={`app ${collapsed ? "nav-collapsed" : ""}`}
        data-workspace-shell="true"
      >
        <a href="#workspace-content" className="skip-link">
          Skip to workspace
        </a>
        {menu && (
          <button
            className="nav-backdrop"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <aside
          id="workspace-navigation"
          className={menu ? "sidebar open" : "sidebar"}
          onKeyDown={(e) => {
            if (!menu || e.key !== "Tab") return;
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLElement>("a,button"),
            ].filter((el) => el.offsetParent !== null);
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }}
        >
          <Link href="/dashboard" className="brand">
            <span>P3H</span>
            <small>CASE MANAGEMENT</small>
          </Link>

          <button
            className="sidebar-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            <Menu size={18} />
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <nav aria-label="Main navigation">
            {nav
              .filter(
                (n) =>
                  (n[0] !== "audit" || can(u.role, "audit")) &&
                  (n[0] !== "import" || write),
              )
              .map(([key, name, Icon]) => (
                <div key={key}>
                  {(
                    {
                      dashboard: "Overview",
                      members: "People",
                      programmes: "Programmes",
                      grants: "Support",
                      import: "Data",
                      audit: "Administration",
                    } as Record<string, string>
                  )[key] && (
                    <div className="nav-label">
                      {
                        (
                          {
                            dashboard: "Overview",
                            members: "People",
                            programmes: "Programmes",
                            grants: "Support",
                            import: "Data",
                            audit: "Administration",
                          } as Record<string, string>
                        )[key]
                      }
                    </div>
                  )}
                  <Link
                    key={key}
                    href={`/${key}`}
                    onClick={() => setMenu(false)}
                    className={requestedSection === key ? "active" : ""}
                    aria-label={name}
                    title={collapsed ? name : undefined}
                    aria-current={requestedSection === key ? "page" : undefined}
                    prefetch={key === "dashboard" || key === "my-work"}
                  >
                    <Icon size={18} />
                    <span className="nav-text">{name}</span>
                    {key === "alerts" &&
                      data &&
                      (data.dashboardSummary?.totals ||
                        section === "alerts") && (
                        <span className="nav-count">
                          {data.dashboardSummary?.totals?.outstanding ??
                            data.alerts.filter((a) => a.status === "Pending")
                              .length}
                        </span>
                      )}
                  </Link>
                </div>
              ))}
          </nav>
          <div className="local-note">
            <ShieldCheck size={18} />
            <div>
              {auth.hosted ? "Hosted database" : "Local data storage"}
              <small>Restricted staff access</small>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <button
              className="mobile-menu secondary"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <GlobalSearch key={u.accessKey} />
            <button
              className="secondary icon-button"
              aria-label="Refresh current page"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw size={18} />
            </button>
            <span className="topbar-context">
              {nav.find((n) => n[0] === requestedSection)?.[1] || "Profile"}
            </span>
            <Link
              className="secondary icon-button"
              href="/alerts"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </Link>
            <Link
              className="secondary icon-button"
              href="/settings"
              aria-label="Account settings"
            >
              <Settings size={18} />
            </Link>
            <div className="user">
              <span>
                {u.name}
                <small>{u.role}</small>
              </span>
              <button
                className="secondary icon-button"
                aria-label="Sign out"
                onClick={async () => {
                  endSession();
                  await request("/api/auth", { action: "logout" });
                  router.push("/dashboard");
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <main id="workspace-content" aria-busy={refreshing}>
            {children}
            <div className="page-head" key={`${section}:${recordId}`}>
              <div>
                <p className="eyebrow">P3H MANAGEMENT</p>
                <h1>{title}</h1>
                <p className="muted">
                  {section === "dashboard"
                    ? `Good ${Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hour12: false }).format(new Date())) < 12 ? "morning" : "afternoon"}, ${u.name}. Here is what needs your attention today.`
                    : "Maintain accurate records and coordinate support."}
                </p>
              </div>
              <span className="date">{today()}</span>
            </div>
            {(refreshing || preparing) && (
              <p className="inline-progress" role="status">
                {preparing
                  ? "Preparing form..."
                  : dataSection !== requestedKey
                    ? `Opening ${nav.find((n) => n[0] === requestedSection)?.[1] || "requested profile"}...`
                    : "Refreshing records..."}
              </p>
            )}
            {error && (
              <div className="error" role="alert">
                {error}{" "}
                <button
                  className="secondary"
                  onClick={() => {
                    setError("");
                    void load();
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {notice && (
              <div className="notice" role="status">
                {notice}
                <button
                  className="secondary"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {restricted ? (
              <section className="panel">
                Your role does not permit this page.
              </section>
            ) : !data ? (
              <section className="panel initial-content" role="status">
                <p>Preparing your workspace...</p>
                <LoadingSkeleton />
              </section>
            ) : (
              <>
                {section === "dashboard" && (
                  <>
                    <div className="actions">
                      {write && (
                        <>
                          <button onClick={() => personEditor()}>
                            Add Caregiver
                          </button>
                          <button
                            className="secondary"
                            onClick={() => grantEditor()}
                          >
                            Add Grant/Referral
                          </button>
                        </>
                      )}
                      <Link href="/alerts">
                        Notifications (
                        {data.dashboardSummary?.totals?.outstanding ??
                          data.alerts.filter((a) => a.status === "Pending")
                            .length}
                        )
                      </Link>
                    </div>
                    <Overview
                      d={data}
                      userId={u.id}
                      manager={can(u.role, "audit")}
                      write={write}
                      action={action}
                    />
                  </>
                )}
                {section === "my-work" && (
                  <MyWork
                    d={data}
                    userId={u.id}
                    manager={can(u.role, "audit")}
                    write={write}
                    action={action}
                  />
                )}
                {(section === "members" || section === "care-recipients") && (
                  <People
                    d={data}
                    key={section}
                    revision={revision}
                    kind={section === "members" ? "Member" : "Care Recipient"}
                    write={write}
                    onEdit={personEditor}
                    onArchive={(p) => {
                      if (
                        window.confirm(
                          `Archive ${label(p)}? The record and history will be retained.`,
                        )
                      )
                        void safeAction("archive", { type: "person" }, p.id);
                    }}
                  />
                )}
                {section === "people" && (
                  <Profile
                    d={data}
                    key={recordId}
                    id={recordId ?? ""}
                    write={write}
                    onEdit={personEditor}
                    grant={grantEditor}
                    alert={createAlert}
                    edit={(e) => void openEditor(e)}
                    action={safeAction}
                  />
                )}
                {section === "programmes" && (
                  <Programmes
                    dataRevision={revision}
                    write={write}
                    user={u}
                    onRefresh={() => {
                      invalidate("programme");
                      return load(true);
                    }}
                    onEdit={programmeEditor}
                    onArchive={(p) => {
                      if (window.confirm(`Archive ${p.name}?`))
                        void safeAction("archive", { type: "programme" }, p.id);
                    }}
                  />
                )}
                {section === "matching" && (
                  <Matching d={data} write={write} action={safeAction} />
                )}
                {section === "grants" && (
                  <Grants
                    revision={revision}
                    d={data}
                    write={write}
                    onEdit={grantEditor}
                    onSaved={() => {
                      invalidate("grant");
                      return load(true);
                    }}
                  />
                )}
                {section === "alerts" && (
                  <Alerts
                    d={data}
                    write={write}
                    action={safeAction}
                    onCreate={createAlert}
                    userId={u.id}
                    followUpAction={action}
                  />
                )}
                {section === "import" && (
                  <>
                    <ImportWizard
                      onImported={() => {
                        invalidate("person");
                        return load(true);
                      }}
                    />
                    <ImportHistory
                      admin={can(u.role, "admin")}
                      revision={data}
                    />
                  </>
                )}
                {section === "reports" && <Reports d={data} />}
                {section === "audit" && <AuditLog d={data} />}
                {section === "settings" && (
                  <section className="panel">
                    {can(u.role, "admin") && (
                      <NotificationSettings staff={data.staff} />
                    )}
                    <h2>Staff accounts</h2>
                    <p>
                      Sessions last 8 hours. Admin manages accounts; Manager can
                      review audit history; Staff can maintain records; Read
                      Only can view records.
                    </p>
                    {can(u.role, "admin") && (
                      <button
                        onClick={() =>
                          setEdit({
                            title: "Add staff account",
                            fields: userFields,
                            initial: { role: "Staff" },
                            action: "user",
                          })
                        }
                      >
                        Add staff account
                      </button>
                    )}
                    <Table
                      headers={[
                        "Staff",
                        "Username",
                        "Email",
                        "Role",
                        "Status",
                        "Centre access",
                        "Actions",
                      ]}
                      rows={data.staff.map((s) => ({
                        id: s.id,
                        sort: s.name,
                        cells: [
                          s.name,
                          s.username,
                          s.email ?? "?",
                          <Badge key="role">{s.role}</Badge>,
                          s.active ? "Active" : "Inactive",
                          s.role === "Admin" || s.allCentres
                            ? "All centres"
                            : s.allowedCentres.map((c) => c.centre).join(", "),
                          can(u.role, "admin") ? (
                            <div key="access" className="row-actions">
                              <button
                                className="secondary"
                                onClick={() =>
                                  setEdit({
                                    title: "Staff account and notifications",
                                    action: "staffSettings",
                                    id: s.id,
                                    fields: [
                                      {
                                        key: "name",
                                        label: "Staff name",
                                        required: true,
                                      },
                                      { key: "email", label: "Staff email" },
                                      {
                                        key: "emailNotifications",
                                        label: "Email notifications",
                                        type: "select",
                                        options: ["Enabled", "Disabled"].map(
                                          (value) => ({ value, label: value }),
                                        ),
                                      },
                                      {
                                        key: "recipientBirthdays",
                                        label:
                                          "Care recipient birthday reminders",
                                        type: "select",
                                        options: ["Enabled", "Disabled"].map(
                                          (value) => ({ value, label: value }),
                                        ),
                                      },
                                      {
                                        key: "active",
                                        label: "Account status",
                                        type: "select",
                                        options: ["Active", "Inactive"].map(
                                          (value) => ({ value, label: value }),
                                        ),
                                      },
                                      {
                                        key: "role",
                                        label: "Role",
                                        type: "select",
                                        options: [
                                          "Admin",
                                          "Manager",
                                          "Staff",
                                          "Read Only",
                                        ].map((value) => ({
                                          value,
                                          label: value,
                                        })),
                                      },
                                      {
                                        key: "password",
                                        label:
                                          "New password (optional, at least 12 characters)",
                                        type: "password",
                                      },
                                    ],
                                    initial: {
                                      name: s.name,
                                      email: s.email ?? "",
                                      emailNotifications: s.emailNotifications
                                        ? "Enabled"
                                        : "Disabled",
                                      recipientBirthdays: s.recipientBirthdays
                                        ? "Enabled"
                                        : "Disabled",
                                      active: s.active ? "Active" : "Inactive",
                                      role: s.role,
                                    },
                                  })
                                }
                              >
                                Edit account
                              </button>
                              <button
                                key="access"
                                className="secondary"
                                onClick={() =>
                                  setEdit({
                                    title: "Centre permissions",
                                    action: "userAccess",
                                    id: s.id,
                                    fields: [
                                      {
                                        key: "allCentres",
                                        label: "Access",
                                        type: "select",
                                        options: [
                                          {
                                            value: "All centres",
                                            label: "All centres",
                                          },
                                          {
                                            value: "Selected centres",
                                            label: "Selected centres",
                                          },
                                        ],
                                      },
                                      {
                                        key: "centres",
                                        label: "Allowed centres",
                                        type: "chips",
                                        hint: "Use exact centre names from case records",
                                      },
                                    ],
                                    initial: {
                                      allCentres: s.allCentres
                                        ? "All centres"
                                        : "Selected centres",
                                      centres: s.allowedCentres
                                        .map((c) => c.centre)
                                        .join(", "),
                                    },
                                  })
                                }
                              >
                                Edit access
                              </button>
                            </div>
                          ) : (
                            "?"
                          ),
                        ],
                      }))}
                    />
                    <h2>Data and backups</h2>
                    <p>
                      {auth.hosted ? (
                        "Records are stored in hosted PostgreSQL. Follow the deployment guide for database exports and restore checks. The local SQLite backup command does not apply."
                      ) : (
                        <>
                          The database is stored in <code>data/p3h.db</code>.
                          Use <code>npm run backup</code> to create a verified
                          local backup.
                        </>
                      )}
                      Backups contain confidential data and must receive the
                      same access controls as the database.
                    </p>
                    <p>
                      Follow the README for hosting, access controls and backup
                      instructions.
                    </p>
                  </section>
                )}
                {section === "search" && <SearchPage d={data} />}
                {![
                  "dashboard",
                  "my-work",
                  "members",
                  "care-recipients",
                  "people",
                  "programmes",
                  "matching",
                  "grants",
                  "alerts",
                  "import",
                  "reports",
                  "audit",
                  "settings",
                  "search",
                ].includes(section) && (
                  <section className="panel">
                    <h2>Page not found</h2>
                    <Link href="/dashboard">Return to dashboard</Link>
                  </section>
                )}
              </>
            )}
          </main>
          <footer>
            Internal P3H workspace · Data remains on your organisation’s host
          </footer>
        </div>
        {edit && (
          <Editor
            {...edit}
            onClose={() => setEdit(null)}
            onSave={(v) =>
              action(
                edit.action,
                { ...v, ...edit.extra },
                edit.id,
                edit.version,
              )
            }
          />
        )}
      </div>
    </WorkspaceCacheContext.Provider>
  );
}
