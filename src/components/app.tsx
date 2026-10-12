"use client";
import MyWork from "./my-work";
import GlobalSearch from "./global-search";
import SearchPage from "./searchpage";
import AuditLog from "./auditlog";
import Reports from "./reports";
import Alerts from "./alerts";
import Grants from "./grants";
import Matching from "./matching";
import Programmes from "./programmes";
import Profile from "./profile";
import People from "./people";
import Overview from "./overview";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import ImportWizard from "./import-wizard";
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["my-work", "My Work", Users],
  ["members", "Members", Users],
  ["care-recipients", "Care Recipients", HeartHandshake],
  ["programmes", "Programmes", CalendarDays],
  ["matching", "Programme Matching", ScanSearch],
  ["grants", "Grants & Support", HandCoins],
  ["alerts", "Alerts", Bell],
  ["import", "Import Data", Upload],
  ["reports", "Reports", ChartNoAxesCombined],
  ["audit", "Audit Log", History],
  ["settings", "Settings", Settings],
] as const;
type User = { id: string; name: string; role: string };
export default function DashboardApp({
  section,
  recordId,
}: {
  section: string;
  recordId?: string;
}) {
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
  const load = useCallback(async () => {
    try {
      setData(
        await request(`/api/data?section=${encodeURIComponent(section)}`),
      );
      setDataSection(section);
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        setAuth({ user: null, setup: false });
        setData(null);
      }
      setError(e instanceof Error ? e.message : "Unable to load");
    }
  }, [section]);
  useEffect(() => {
    let mounted = true;
    void request("/api/auth")
      .then((a) => {
        if (mounted) {
          setAuth(a);
          if (a.user) void load();
        }
      })
      .catch(() =>
        setError(
          "Cannot connect to the database. Check the setup instructions.",
        ),
      );
    return () => {
      mounted = false;
    };
  }, [load]);
  const action = async (
    action: string,
    values: Record<string, unknown> = {},
    id?: string,
    version?: string,
  ) => {
    await request("/api/action", { action, data: values, id, version });
    await load();
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
      <main className="login" role="status">
        {error || "Connecting to P3H…"}
      </main>
    );
  if (!auth.user)
    return (
      <Login
        setup={auth.setup}
        setupRequiresToken={auth.setupRequiresToken}
        hosted={auth.hosted}
        onDone={async () => {
          setAuth(await request("/api/auth"));
          await load();
        }}
      />
    );
  const u = auth.user,
    write = can(u.role, "write");
  const title =
    section === "people"
      ? "Person profile"
      : (nav.find((n) => n[0] === section)?.[1] ?? "Search");
  const restricted =
    (section === "audit" && !can(u.role, "audit")) ||
    (section === "import" && !write);
  const personEditor = (p?: Person, kind = "Member") =>
    setEdit({
      title: p ? `Edit ${label(p)}` : `Add ${kind.toLowerCase()}`,
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
      fields: programmeFields.map((f) => ({
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
        ? programmeValues(p)
        : { status: "Active", registrationStatus: "Open", capacity: 0 },
      action: "programme",
      id: p?.id,
      version: p?.updatedAt,
    });
  const grantEditor = (g?: Grant, personId?: string) =>
    data &&
    setEdit({
      title: g ? "Edit grant / support" : "Add grant / support",
      fields: grantFields(data),
      initial: g
        ? grantValues(g)
        : { status: "Not Applied", personId: personId ?? "" },
      action: "grant",
      id: g?.id,
      version: g?.updatedAt,
      confirm: Boolean(g),
    });
  const createAlert = (personId?: string) =>
    data &&
    setEdit({
      title: "Create reminder",
      fields: alertFields(data),
      initial: {
        priority: "Normal",
        type: "Custom reminder",
        personId: personId ?? "",
      },
      action: "alert",
    });
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link href="/dashboard" className="brand">
          <span>P3H</span>
          <small>CASE MANAGEMENT</small>
        </Link>

        <nav>
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
                  className={section === key ? "active" : ""}
                >
                  <Icon size={18} />
                  {name}
                  {key === "alerts" && data && (
                    <span className="nav-count">
                      {data.alerts.filter((a) => a.status === "Pending").length}
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
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="user">
            <span>
              {u.name}
              <small>{u.role}</small>
            </span>
            <button
              className="secondary icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await request("/api/auth", { action: "logout" });
                setAuth({ user: null, setup: false });
                setData(null);
                router.push("/dashboard");
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-head">
            <div>
              <p className="eyebrow">P3H MANAGEMENT</p>
              <h1>{title}</h1>
              <p className="muted">
                {section === "dashboard"
                  ? `Hello, ${u.name}. Here is what needs your attention today.`
                  : "Maintain accurate records and coordinate support."}
              </p>
            </div>
            <span className="date">{today()}</span>
          </div>
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
          ) : !data || dataSection !== section ? (
            <LoadingSkeleton />
          ) : (
            <>
              {section === "dashboard" && <Overview d={data} />}
              {section === "my-work" && (
                <MyWork d={data} userId={u.id} manager={can(u.role, "audit")} />
              )}
              {(section === "members" || section === "care-recipients") && (
                <People
                  d={data}
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
                  id={recordId ?? ""}
                  write={write}
                  onEdit={personEditor}
                  grant={grantEditor}
                  alert={createAlert}
                  edit={setEdit}
                  action={safeAction}
                />
              )}
              {section === "programmes" && (
                <Programmes
                  d={data}
                  write={write}
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
                  d={data}
                  write={write}
                  onEdit={grantEditor}
                  onSaved={load}
                />
              )}
              {section === "alerts" && (
                <Alerts
                  d={data}
                  write={write}
                  action={safeAction}
                  onCreate={createAlert}
                  userId={u.id}
                />
              )}
              {section === "import" && (
                <>
                  <ImportWizard onImported={load} />
                  <ImportHistory admin={can(u.role, "admin")} revision={data} />
                </>
              )}
              {section === "reports" && <Reports d={data} />}
              {section === "audit" && <AuditLog d={data} />}
              {section === "settings" && (
                <section className="panel">
                  <h2>Staff accounts</h2>
                  <p>
                    Sessions last 8 hours. Admin manages accounts; Manager can
                    review audit history; Staff can maintain records; Read Only
                    can view records.
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
                        <Badge key="role">{s.role}</Badge>,
                        s.active ? "Active" : "Inactive",
                        s.role === "Admin" || s.allCentres
                          ? "All centres"
                          : s.allowedCentres.map((c) => c.centre).join(", "),
                        can(u.role, "admin") ? (
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
                        The database is stored in <code>data/p3h.db</code>. Use{" "}
                        <code>npm run backup</code> to create a verified local
                        backup.
                      </>
                    )}
                    Backups contain confidential data and must receive the same
                    access controls as the database.
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
            action(edit.action, { ...v, ...edit.extra }, edit.id, edit.version)
          }
        />
      )}
    </div>
  );
}
