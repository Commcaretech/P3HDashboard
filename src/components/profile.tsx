"use client";
import { useState } from "react";
import Link from "next/link";
import { Data, Person, Grant, label, day } from "@/lib/types";
import { Table, Badge, PersonLink } from "./ui";
import { completeness, alertDue } from "@/lib/workflow";
import { names, Editing } from "./common";
export default function Profile({
  d,
  id,
  write,
  onEdit,
  grant,
  alert,
  edit,
  action,
}: {
  d: Data;
  id: string;
  write: boolean;
  onEdit: (p: Person) => void;
  grant: (g?: Grant, personId?: string) => void;
  alert: (id?: string) => void;
  edit: (e: Editing) => void;
  action: (
    a: string,
    v?: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
}) {
  const [tab, setTab] = useState("Overview");
  const p = d.people.find((x) => x.id === id);
  if (!p)
    return (
      <section className="panel">
        Record not found. <Link href="/members">Return to members</Link>
      </section>
    );
  const links = [...p.caregiverLinks, ...p.recipientLinks];
  const relatedGrants = d.grants.filter((g) => g.personId === p.id),
    alerts = d.alerts.filter((a) => a.personId === p.id);
  const recipients = p.caregiverLinks
    .map((l) => d.people.find((r) => r.id === l.recipientId))
    .filter((r): r is Person => Boolean(r));
  const progress = completeness(p, recipients);
  const next = alerts
    .filter((a) => a.status === "Pending")
    .sort((a, b) => alertDue(a).localeCompare(alertDue(b)))[0];
  return (
    <>
      <div className="profile-head panel">
        <div>
          <h2>{label(p)}</h2>
          <p>
            {p.kind} · {p.memberId ?? p.alias} · <Badge>{p.status}</Badge>
          </p>
        </div>
        <div>
          <strong>{p.centre || "Centre not recorded"}</strong>
          <small>
            {p.preferredLanguage ||
              names(p).languages.join(", ") ||
              "Language not recorded"}
          </small>
          <small>
            {p.kind === "Member"
              ? `P3H since ${day(p.onboardingDate)}`
              : p.mobility || "Mobility not recorded"}
          </small>
        </div>
        <div>
          <small>Assigned staff</small>
          <strong>{p.assigned?.name ?? "Unassigned"}</strong>
          <small>{p.primaryCondition || names(p).conditions.join(", ")}</small>
        </div>
        {write && <button onClick={() => onEdit(p)}>Edit profile</button>}
      </div>
      <section className="panel relationship-summary">
        <small>
          {p.kind === "Member" ? "Care recipients" : "Linked caregivers"}
        </small>
        {links.length ? (
          links.map((l) => {
            const related = d.people.find(
              (x) =>
                x.id === (p.kind === "Member" ? l.recipientId : l.memberId),
            );
            return (
              related && (
                <p key={l.id}>
                  <PersonLink id={related.id}>{label(related)}</PersonLink> ·{" "}
                  {l.relationship}
                  {p.kind === "Member" &&
                    ` · ${names(related).conditions.join(", ") || "Conditions not recorded"}`}
                </p>
              )
            );
          })
        ) : (
          <p>No care relationships recorded.</p>
        )}
      </section>
      <section className="panel profile-summary">
        <div>
          <small>Next action</small>
          {next ? (
            <Link href={`/alerts?q=${encodeURIComponent(next.title)}`}>
              {next.title}
              <small>{day(alertDue(next))}</small>
            </Link>
          ) : (
            "No pending action"
          )}
        </div>
        <div>
          <small>Outstanding alerts</small>
          <strong>{alerts.filter((a) => a.status === "Pending").length}</strong>
        </div>
        <div>
          <small>Support schemes</small>
          {relatedGrants.map((g) => g.scheme.name).join(", ") ||
            "None recorded"}
          <small>
            {p.participations.length} programme participation records
          </small>
        </div>
        <div>
          <small>Profile completeness</small>
          <strong>{progress.score}%</strong>
          <progress
            value={progress.score}
            max={100}
            aria-label="Profile completeness"
          />
          <small>
            {progress.missing.length
              ? `Missing: ${progress.missing.join(", ")}`
              : "Matching information recorded"}
          </small>
        </div>
      </section>
      <div className="tabs">
        {[
          "Overview",
          "Health",
          "Interests",
          "Care Relationships",
          "Programmes",
          "Grants & Referrals",
          "Alerts",
          "Notes",
          "Follow-up History",
          "History",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="panel">
        {tab === "Follow-up History" && (
          <>
            <h3>Completed grant and referral follow-ups</h3>
            {relatedGrants.flatMap((g) =>
              (g.followUps ?? []).map((h) => (
                <div key={h.id} className="attention-item">
                  <div>
                    <strong>
                      {g.scheme.name} ? {h.outcome}
                    </strong>
                    <small>
                      {day(h.completedAt)} ?{" "}
                      {d.staff.find((s) => s.id === h.completedBy)?.name ??
                        "Staff"}
                      {h.resolved ? " ? Resolved" : ""}
                    </small>
                    <p className="preserve">{h.notes || "No notes recorded"}</p>
                  </div>
                </div>
              )),
            )}
            {!relatedGrants.some((g) => g.followUps?.length) && (
              <p className="empty">No completed follow-ups recorded.</p>
            )}
          </>
        )}
        {tab === "Overview" && (
          <dl className="detail-grid">
            {[
              ["Date of birth", day(p.dob)],
              ["Contact number", p.contactNumber],
              ["Centre", p.centre],
              ["Gender", p.gender],
              ["Race", p.race],
              ["Working status", p.workingStatus],
              ["Preferred language", p.preferredLanguage],
              [
                "Languages",
                p.languages
                  .map((x) => `${x.language.name} (${x.mode})`)
                  .join(", "),
              ],
              ["P3H onboarding", day(p.onboardingDate)],
              ["Created", day(p.createdAt)],
              ["Updated", day(p.updatedAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "Not recorded"}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === "Health" && (
          <>
            <dl className="detail-grid">
              {[
                ["Primary condition", p.primaryCondition],
                [
                  "Other / mental health conditions",
                  names(p).conditions.join(", "),
                ],
                ["Mobility", p.mobility],
                ["Hearing", p.hearing],
                ["Eyesight", p.eyesight],
                ["Diet", p.dietaryPreference],
                ["Food allergies", p.foodAllergies],
                ["Education", p.education],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "Not recorded"}</dd>
                </div>
              ))}
            </dl>
            <h3>Assessments</h3>
            {p.assessments.length ? (
              p.assessments.map((a) => (
                <p key={a.id}>
                  {a.type}: {a.value} · Assessed:{" "}
                  {a.assessedAt ? day(a.assessedAt) : "date not recorded"} ·
                  Recorded: {day(a.recordedAt)}
                </p>
              ))
            ) : (
              <p>
                No assessments recorded. Add a ZBI assessment through Edit
                profile.
              </p>
            )}
          </>
        )}
        {tab === "Interests" && (
          <>
            <h3>Interests</h3>
            <p>{names(p).interests.join(", ") || "Not recorded"}</p>
            <h3>Tags</h3>
            <p>{p.tags || "Not recorded"}</p>
          </>
        )}
        {tab === "Care Relationships" && (
          <>
            {write && (
              <button
                onClick={() =>
                  edit({
                    title: "Link care recipient",
                    action: "relationship",
                    initial: {
                      memberId: p.kind === "Member" ? p.id : "",
                      recipientId: p.kind === "Care Recipient" ? p.id : "",
                    },
                    fields: [
                      {
                        key: "memberId",
                        label: "Member / caregiver",
                        type: "select",
                        options: d.people
                          .filter(
                            (x) => x.kind === "Member" && x.status === "Active",
                          )
                          .map((x) => ({ value: x.id, label: label(x) })),
                      },
                      {
                        key: "recipientId",
                        label: "Care recipient",
                        type: "select",
                        options: d.people
                          .filter(
                            (x) =>
                              x.kind === "Care Recipient" &&
                              x.status === "Active",
                          )
                          .map((x) => ({ value: x.id, label: label(x) })),
                      },
                      {
                        key: "relationship",
                        label: "Relationship",
                        required: true,
                      },
                    ],
                  })
                }
              >
                Link care recipient
              </button>
            )}
            <Table
              headers={["Related person", "Relationship", "Action"]}
              rows={links.map((l) => {
                const other = d.people.find(
                  (x) =>
                    x.id === (p.kind === "Member" ? l.recipientId : l.memberId),
                )!;
                return {
                  id: l.id,
                  sort: label(other),
                  cells: [
                    <PersonLink key="p" id={other.id}>
                      {label(other)}
                    </PersonLink>,
                    l.relationship,
                    write ? (
                      <button
                        key="remove"
                        className="secondary"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this care relationship? Both profiles will be retained.",
                            )
                          )
                            void action("unlink", {}, l.id);
                        }}
                      >
                        Remove link
                      </button>
                    ) : (
                      "—"
                    ),
                  ],
                };
              })}
            />
          </>
        )}
        {tab === "Programmes" && (
          <>
            {write && (
              <button
                onClick={() =>
                  edit({
                    title: "Record programme participation",
                    action: "participation",
                    initial: { personId: p.id, status: "Registered" },
                    extra: { personId: p.id },
                    fields: [
                      {
                        key: "programmeId",
                        label: "Programme",
                        type: "select",
                        options: [
                          { value: "", label: "Select programme" },
                          ...d.programmes
                            .filter((x) => x.status === "Active")
                            .map((x) => ({ value: x.id, label: x.name })),
                        ],
                      },
                      {
                        key: "status",
                        label: "Participation status",
                        type: "select",
                        options: [
                          "Registered",
                          "Attended",
                          "Completed",
                          "Withdrawn",
                        ].map((x) => ({ value: x, label: x })),
                      },
                    ],
                  })
                }
              >
                Record participation
              </button>
            )}
            <Table
              headers={["Programme", "Status"]}
              rows={p.participations.map((x) => ({
                id: x.id,
                sort: x.programme.name,
                cells: [x.programme.name, x.status],
              }))}
            />
            <Link href={`/matching?member=${p.kind === "Member" ? p.id : ""}`}>
              Find suitable programmes →
            </Link>
          </>
        )}
        {tab === "Grants & Referrals" && (
          <>
            {write && (
              <button onClick={() => grant(undefined, p.id)}>
                Add grant / support
              </button>
            )}
            <Table
              headers={["Scheme", "Status", "Review", "Amount", "Action"]}
              rows={relatedGrants.map((g) => ({
                id: g.id,
                sort: g.scheme.name,
                cells: [
                  g.scheme.name,
                  g.status,
                  day(g.nextReviewDate),
                  g.amount ?? "—",
                  write ? (
                    <button
                      className="secondary"
                      key="edit"
                      onClick={() => grant(g)}
                    >
                      Edit
                    </button>
                  ) : (
                    "—"
                  ),
                ],
              }))}
            />
          </>
        )}
        {tab === "Alerts" && (
          <>
            {write && (
              <button onClick={() => alert(p.id)}>Create reminder</button>
            )}
            <Table
              headers={["Alert", "Due", "Status"]}
              rows={alerts.map((a) => ({
                id: a.id,
                sort: a.dueDate,
                cells: [a.title, day(a.dueDate), a.status],
              }))}
            />
          </>
        )}
        {tab === "Notes" && (
          <>
            <h3>Remarks</h3>
            <p className="preserve">{p.remarks || "No notes recorded."}</p>
            {p.rawImport && (
              <details>
                <summary>Original imported cells</summary>
                <dl>
                  {Object.entries(p.rawImport).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className="preserve">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </>
        )}
        {tab === "History" &&
          (d.audit.length ? (
            <Table
              headers={["Action", "Staff", "Date", "Changed values"]}
              rows={d.audit
                .filter((a) => a.entityId === p.id)
                .map((a) => ({
                  id: a.id,
                  sort: a.timestamp,
                  cells: [
                    a.action,
                    a.user.name,
                    day(a.timestamp),
                    <details key="changes">
                      <summary>Review changes</summary>
                      <pre>{JSON.stringify(a.changes, null, 2)}</pre>
                    </details>,
                  ],
                }))}
            />
          ) : (
            <p>
              Detailed audit history is available to Admin and Manager accounts.
            </p>
          ))}
      </section>
    </>
  );
}
