"use client";
import Link from "next/link";
import { Data, label, day } from "@/lib/types";
import { birthday, today } from "@/lib/domain";
import { Table, Badge, PersonLink } from "./ui";
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
      <div className="stat-grid">
        {cards.map(([name, n, url]) => (
          <Link className="stat" key={name} href={String(url)}>
            <small>{name}</small>
            <strong>{n}</strong>
            <span>View records →</span>
          </Link>
        ))}
      </div>
      <div className="section-head">
        <h2>Upcoming actions</h2>
        <Link href="/alerts">View all alerts →</Link>
      </div>
      <Table
        headers={["Action", "Person", "Due date", "Priority", "Status"]}
        rows={pending.slice(0, 10).map((a) => ({
          id: a.id,
          sort: a.dueDate,
          cells: [
            <Link key="a" href="/alerts">
              {a.title}
            </Link>,
            a.personId ? (
              <PersonLink key="p" id={a.personId}>
                {label(d.people.find((p) => p.id === a.personId)!)}
              </PersonLink>
            ) : (
              "—"
            ),
            day(a.dueDate),
            <Badge key="priority">{a.priority}</Badge>,
            a.status,
          ],
        }))}
      />
      <div className="chart-grid">
        <Chart
          title="Care recipients by condition"
          href="/care-recipients"
          values={count(
            recipients.flatMap((p) =>
              p.conditions.map((x) => x.condition.name),
            ),
          )}
        />
        <Chart
          title="Language distribution"
          href="/members"
          values={count(
            d.people
              .filter((p) => p.status === "Active")
              .flatMap((p) => p.languages.map((x) => x.language.name)),
          )}
        />
        <Chart
          title="Member interests"
          href="/members"
          values={count(
            members.flatMap((p) => p.interests.map((x) => x.interest.name)),
          )}
        />
        <Chart
          title="Care recipient interests"
          href="/care-recipients"
          values={count(
            recipients.flatMap((p) => p.interests.map((x) => x.interest.name)),
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
          )}
        />
      </div>
    </>
  );
}
