"use client";
import Birthdays from "./birthdays";
import { FollowUpDialog } from "./follow-up-dialog";
import { useState } from "react";
import { Alert } from "@/lib/types";
import { closedGrant } from "@/lib/follow-up";
import { Bell, CalendarDays, AlertTriangle, Cake } from "lucide-react";
import { alertDue, alertGroup, alertGroups } from "@/lib/workflow";
import Link from "next/link";
import { Data, label, day } from "@/lib/types";
import { birthday, today } from "@/lib/domain";
import { Badge, PersonLink } from "./ui";
import { Chart } from "./charts";
import { count } from "./common";
export default function Overview({
  d,
  userId,
  manager,
  write,
  action,
}: {
  d: Data;
  userId: string;
  manager: boolean;
  write: boolean;
  action: (a: string, v: Record<string, unknown>, id?: string) => Promise<void>;
}) {
  const [followUp, setFollowUp] = useState<Alert | null>(null);
  const totals = d.dashboardSummary?.totals;
  const members = d.people.filter(
      (p) => p.kind === "Member" && p.status === "Active",
    ),
    recipients = d.people.filter(
      (p) => p.kind === "Care Recipient" && p.status === "Active",
    ),
    pending = d.alerts.filter(
      (a) =>
        a.status === "Pending" &&
        (manager ||
          a.assignedId === userId ||
          (!a.assignedId &&
            d.people.some(
              (p) => p.id === a.personId && p.assignedId === userId,
            ))),
    ),
    birthdays = d.people.filter(
      (p) =>
        p.kind === "Member" &&
        p.status === "Active" &&
        p.dob &&
        birthday(new Date(p.dob), today()).days <= 30,
    );
  const cards = [
    [
      "Total Members / Caregivers",
      totals?.members ??
        d.people.filter((p) => p.kind === "Member" && p.status !== "Archived")
          .length,
      "/members",
    ],
    [
      "Total Care Recipients",
      totals?.recipients ??
        d.people.filter(
          (p) => p.kind === "Care Recipient" && p.status !== "Archived",
        ).length,
      "/care-recipients",
    ],
    [
      "Active P3H Cases",
      totals?.activeCases ?? members.length,
      "/members?status=Active",
    ],
    [
      "Care Recipients with Dementia",
      d.dashboardSummary?.conditions.find(
        (c) => c.name.toLowerCase() === "dementia",
      )?.count ??
        recipients.filter((p) =>
          p.conditions.some(
            (c) => c.condition.name.toLowerCase() === "dementia",
          ),
        ).length,
      "/care-recipients?condition=Dementia",
    ],
    [
      "Upcoming Birthdays",
      totals?.birthdays ?? birthdays.length,
      "#upcoming-birthdays",
    ],
    [
      "Applications resolved this month",
      d.dashboardSummary?.completedThisMonth ?? 0,
      "/grants",
    ],
    [
      "Pending Grant Follow-ups",
      totals?.grantFollowups ??
        pending.filter((a) => a.type.startsWith("Grant")).length,
      "/alerts?type=Grant",
    ],
    [
      "Outstanding Alerts",
      totals?.outstanding ?? pending.length,
      "/alerts?status=Pending",
    ],
    [
      "Active Programmes",
      d.dashboardSummary?.activeProgrammes ??
        d.programmes.filter((p) => p.status === "Active").length,
      "/programmes?status=Active",
    ],
  ];
  return (
    <>
      <div className="stat-grid action-metrics">
        {[
          {
            name: "Pending Grants/Referrals",
            n:
              totals?.pendingGrants ??
              d.grants.filter(
                (g) =>
                  !closedGrant(g) &&
                  (manager ||
                    g.assignedId === userId ||
                    (!g.assignedId &&
                      d.people.some(
                        (p) => p.id === g.personId && p.assignedId === userId,
                      ))),
              ).length,
            detail: "Applications with outstanding work",
            href: "/grants?open=true",
            Icon: Bell,
          },
          {
            name: "Tasks Due Today",
            n:
              totals?.today ??
              pending.filter((a) => alertGroup(a) === "Today").length,
            detail: "Actions scheduled today",
            href: "/alerts?time=Today",
            Icon: CalendarDays,
          },
          {
            name: "Overdue Follow-ups",
            n:
              totals?.overdue ??
              pending.filter(
                (a) =>
                  a.type.startsWith("Grant") && alertGroup(a) === "Overdue",
              ).length,
            detail: "Follow up as soon as possible",
            href: "/alerts?time=Overdue&type=Grant",
            Icon: AlertTriangle,
          },
          {
            name: "Upcoming Birthdays",
            n: totals?.birthdays ?? birthdays.length,
            detail: "Active caregivers in the next 30 days",
            href: "#upcoming-birthdays",
            Icon: Cake,
          },
        ]
          .sort(
            (a, b) =>
              [
                "Overdue Follow-ups",
                "Tasks Due Today",
                "Upcoming Birthdays",
                "Pending Grants/Referrals",
              ].indexOf(a.name) -
              [
                "Overdue Follow-ups",
                "Tasks Due Today",
                "Upcoming Birthdays",
                "Pending Grants/Referrals",
              ].indexOf(b.name),
          )
          .map((c) => (
            <Link
              key={c.name}
              className={`stat ${c.name === "Overdue Follow-ups" ? "stat-danger" : c.name === "Tasks Due Today" ? "stat-warning" : ""}`}
              href={
                c.href.startsWith("/alerts") && !manager
                  ? c.href + "&view=my"
                  : c.href === "/grants?open=true" && !manager
                    ? c.href + "&assigned=" + userId
                    : c.href
              }
            >
              <div className="metric-label">
                <small>{c.name}</small>
                <c.Icon size={20} />
              </div>
              <strong>{c.n}</strong>
              <span>{c.detail}</span>
            </Link>
          ))}
      </div>
      <section className="panel attention">
        <div className="section-head">
          <h2>My Tasks Today</h2>
          <Link href="/alerts">View all alerts →</Link>
        </div>
        {!pending.length && (
          <p className="empty">
            No outstanding alerts. Your team is up to date.
          </p>
        )}
        {alertGroups.map((group) => {
          const items = pending
            .filter((a) => alertGroup(a) === group)
            .sort((a, b) => alertDue(a).localeCompare(alertDue(b)));
          return (
            items.length > 0 && (
              <div key={group} className="attention-group">
                <h3>
                  <Badge>{group}</Badge> <small>{items.length} actions</small>
                </h3>
                {items.slice(0, 5).map((a) => (
                  <div key={a.id} className="attention-item">
                    <div>
                      <Link href={`/alerts?q=${encodeURIComponent(a.title)}`}>
                        {a.title}
                      </Link>
                      {a.personId && (
                        <small>
                          <PersonLink id={a.personId}>
                            {label(d.people.find((p) => p.id === a.personId)!)}
                          </PersonLink>
                        </small>
                      )}
                    </div>
                    <span>
                      {day(alertDue(a))}
                      <small>{a.assigned?.name ?? "Unassigned"}</small>
                    </span>
                    <Badge>{a.priority}</Badge>
                    {write && a.grantId && a.type === "Grant review" && (
                      <button
                        className="secondary"
                        onClick={() => setFollowUp(a)}
                      >
                        Mark Follow-up Done
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          );
        })}
      </section>
      <Birthdays staff={d.staff} revision={d} />
      {followUp && (
        <FollowUpDialog
          alert={followUp}
          d={d}
          action={action}
          onClose={() => setFollowUp(null)}
        />
      )}
      <details className="panel management-statistics">
        <summary>Management statistics</summary>
        <div className="section-head">
          <h2>Caseload and support</h2>
          <Link href="/reports">Explore reports →</Link>
        </div>
        <div className="stat-grid">
          {cards.map(([name, n, url]) => (
            <Link className="stat" key={name} href={String(url)}>
              <small>{name}</small>
              <strong>{n}</strong>
              <span>View records →</span>
            </Link>
          ))}
        </div>
        <div className="chart-grid">
          <Chart
            horizontal
            title="Care recipients by condition"
            href="/care-recipients"
            values={
              d.dashboardSummary?.conditions ??
              count(
                recipients.flatMap((p) =>
                  p.conditions.map((x) => x.condition.name),
                ),
              )
            }
          />
          <Chart
            horizontal
            title="Caregiver preferred language"
            href="/members"
            values={
              d.dashboardSummary?.charts?.languages ??
              count(members.map((p) => p.preferredLanguage || "Not recorded"))
            }
          />
          <Chart
            horizontal
            title="Overdue follow-ups by staff"
            href="/alerts?time=Overdue"
            values={
              d.dashboardSummary?.charts?.overdueStaff ??
              count(
                pending
                  .filter(
                    (a) =>
                      a.type.startsWith("Grant") && alertGroup(a) === "Overdue",
                  )
                  .map((a) => a.assigned?.name ?? "Unassigned"),
              )
            }
          />
          <Chart
            title="Grant status"
            href="/grants"
            values={
              d.dashboardSummary?.charts?.grantStatus ??
              count(d.grants.map((g) => g.status))
            }
          />
          <Chart
            title="P3H onboarding by month"
            href="/members"
            values={
              d.dashboardSummary?.charts?.onboarding ??
              count(
                members.flatMap((p) =>
                  p.onboardingDate ? [p.onboardingDate.slice(0, 7)] : [],
                ),
              )
            }
          />
        </div>
      </details>
    </>
  );
}
