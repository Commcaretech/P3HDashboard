"use client";
import { Bell, CalendarDays, AlertTriangle, Cake } from "lucide-react";
import { alertDue, alertGroup, alertGroups } from "@/lib/workflow";
import Link from "next/link";
import { Data, label, day } from "@/lib/types";
import { birthday, today } from "@/lib/domain";
import { Badge, PersonLink } from "./ui";
import { Chart } from "./charts";
import { count } from "./common";
export default function Overview({ d }: { d: Data }) {
  const members = d.people.filter(
      (p) => p.kind === "Member" && p.status === "Active",
    ),
    recipients = d.people.filter(
      (p) => p.kind === "Care Recipient" && p.status === "Active",
    ),
    pending = d.alerts.filter((a) => a.status === "Pending"),
    birthdays = d.people.filter(
      (p) =>
        p.status === "Active" &&
        p.dob &&
        birthday(new Date(p.dob), today()).days <= 30,
    );
  const cards = [
    [
      "Total Members / Caregivers",
      d.people.filter((p) => p.kind === "Member" && p.status !== "Archived")
        .length,
      "/members",
    ],
    [
      "Total Care Recipients",
      d.people.filter(
        (p) => p.kind === "Care Recipient" && p.status !== "Archived",
      ).length,
      "/care-recipients",
    ],
    ["Active P3H Cases", members.length, "/members?status=Active"],
    [
      "Care Recipients with Dementia",
      recipients.filter((p) =>
        p.conditions.some((c) => c.condition.name.toLowerCase() === "dementia"),
      ).length,
      "/care-recipients?condition=Dementia",
    ],
    ["Upcoming Birthdays", birthdays.length, "/reports?view=birthdays"],
    [
      "Pending Grant Follow-ups",
      pending.filter((a) => a.type.startsWith("Grant")).length,
      "/alerts?type=Grant",
    ],
    ["Outstanding Alerts", pending.length, "/alerts?status=Pending"],
    [
      "Active Programmes",
      d.programmes.filter((p) => p.status === "Active").length,
      "/programmes?status=Active",
    ],
  ];
  return (
    <>
      <div className="stat-grid action-metrics">
        {[
          {
            name: "Pending Alerts",
            n: pending.length,
            detail: "Outstanding actions",
            href: "/alerts?status=Pending",
            Icon: Bell,
          },
          {
            name: "Due Today",
            n: pending.filter((a) => alertGroup(a) === "Today").length,
            detail: "Actions scheduled today",
            href: "/alerts?time=Today",
            Icon: CalendarDays,
          },
          {
            name: "Overdue",
            n: pending.filter((a) => alertGroup(a) === "Overdue").length,
            detail: "Follow up as soon as possible",
            href: "/alerts?time=Overdue",
            Icon: AlertTriangle,
          },
          {
            name: "Birthdays This Month",
            n: d.people.filter(
              (p) =>
                p.status === "Active" &&
                p.dob &&
                p.dob.slice(5, 7) === today().slice(5, 7),
            ).length,
            detail: "Active people with a birthday this month",
            href: "/reports?view=birthdays&birthdayMonth=current",
            Icon: Cake,
          },
        ].map((c) => (
          <Link key={c.name} className="stat" href={c.href}>
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
          <h2>Needs attention</h2>
          <Link href="/alerts">View all alerts →</Link>
        </div>
        {!pending.length && (
          <p className="empty">
            No outstanding alerts. Your team is up to date.
          </p>
        )}
        {alertGroups.slice(0, 4).map((group) => {
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
                  </div>
                ))}
              </div>
            )
          );
        })}
      </section>
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
          values={count(
            recipients.flatMap((p) =>
              p.conditions.map((x) => x.condition.name),
            ),
          )}
        />
        <Chart
          horizontal
          title="Language distribution"
          href="/members"
          values={count(
            d.people
              .filter((p) => p.status === "Active")
              .flatMap((p) => p.languages.map((x) => x.language.name)),
          )}
        />
        <Chart
          title="Grant status"
          href="/grants"
          values={count(d.grants.map((g) => g.status))}
        />
        <Chart
          title="P3H onboarding by month"
          href="/members"
          values={count(
            members.flatMap((p) =>
              p.onboardingDate ? [p.onboardingDate.slice(0, 7)] : [],
            ),
          ).sort((a, b) => a.name.localeCompare(b.name))}
        />
      </div>
    </>
  );
}
