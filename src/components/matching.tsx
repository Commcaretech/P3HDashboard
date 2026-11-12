"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Data, label, Person } from "@/lib/types";
import { interestMatch } from "@/lib/interest-matching";
import { mobilityCompatible } from "@/lib/matching";
import {
  nextOccurrence,
  futureOccurrences,
  registrationReady,
  scheduleLabel,
  sourceCentres,
  recommendationReady,
  explicitlyHidden,
} from "@/lib/programme-source";
import { Badge } from "./ui";
import { FilterBar, Filters } from "./common";
export default function Matching({
  d,
  write,
  action,
}: {
  d: Data;
  write: boolean;
  action: (a: string, v: Record<string, unknown>) => Promise<void>;
}) {
  const params = useSearchParams();
  const [target, setTarget] = useState<"Care Recipient" | "Member">(
      "Care Recipient",
    ),
    [memberId, setMember] = useState(params.get("member") || ""),
    [recipientId, setRecipient] = useState(params.get("recipient") || ""),
    [run, setRun] = useState(false),
    [f, setF] = useState<Filters>({
      centre:
        sourceCentres[params.get("centre") || ""] || params.get("centre") || "",
    });
  const member = d.people.find((p) => p.id === memberId),
    recipient = d.people.find((p) => p.id === recipientId),
    members = d.people.filter(
      (p) => p.kind === "Member" && p.status === "Active",
    );
  const seniors = member
    ? member.caregiverLinks
        .map((l) => d.people.find((p) => p.id === l.recipientId))
        .filter((p): p is Person => Boolean(p && p.status === "Active"))
    : d.people.filter(
        (p) => p.kind === "Care Recipient" && p.status === "Active",
      );
  const subject = target === "Member" ? member : recipient;
  const results = subject
    ? d.programmes
        .filter(
          (p) =>
            recommendationReady(p) &&
            (!f.centre || p.centre === f.centre) &&
            (!f.category || p.category === f.category) &&
            (!f.q ||
              [p.name, p.category, p.description]
                .join(" ")
                .toLowerCase()
                .includes(f.q.toLowerCase())) &&
            (!f.language ||
              ((p.review?.languageAssessment === "Assessed" || !p.external) &&
                p.languages.some((l) => l.language.name === f.language))) &&
            (!f.day ||
              p.day === f.day ||
              p.external?.occurrences.some((o) => o.day === f.day)) &&
            (!f.venue ||
              p.venue === f.venue ||
              p.external?.occurrences.some((o) => o.venue === f.venue)) &&
            (!f.availability || registrationReady(p)),
        )
        .map((p) => ({
          p,
          ...interestMatch(
            {
              kind: subject.kind,
              interests: subject.interests.map((x) => x.interest.name),
              languages: subject.languages.map((x) => x.language.name),
              mobility: subject.mobility,
              centre: subject.centre,
            },
            p,
          ),
        }))
        .filter((r) => r.eligible)
        .sort(
          (a, b) =>
            b.score - a.score ||
            Number(Boolean(nextOccurrence(b.p))) -
              Number(Boolean(nextOccurrence(a.p))) ||
            a.p.name.localeCompare(b.p.name),
        )
    : [];
  return (
    <>
      <section className="panel">
        <h2>Find programme recommendations</h2>
        <p>
          Suggestions automatically use recorded interests, programme names,
          descriptions, session details and source domains. They do not
          establish medical suitability or registration availability.
        </p>
        <div
          className="tabs"
          role="tablist"
          aria-label="Recommendation audience"
        >
          {[
            ["Care Recipient", "Senior / care recipient"],
            ["Member", "Caregiver"],
          ].map(([value, text]) => (
            <button
              key={value}
              role="tab"
              aria-selected={target === value}
              className={target === value ? "selected" : "secondary"}
              onClick={() => {
                setTarget(value as "Member" | "Care Recipient");
                setRun(false);
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            Member / caregiver
            <select
              aria-label="Member / caregiver"
              value={memberId}
              onChange={(e) => {
                setMember(e.target.value);
                setRecipient("");
                setRun(false);
              }}
            >
              <option value="">
                {target === "Care Recipient"
                  ? "Optional: narrow to linked seniors"
                  : "Select caregiver"}
              </option>
              {members.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </select>
          </label>
          {target === "Care Recipient" && (
            <label>
              {member ? "Linked care recipient" : "Care recipient / senior"}
              <select
                aria-label={
                  member ? "Linked care recipient" : "Care recipient / senior"
                }
                value={recipientId}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setRun(false);
                }}
              >
                <option value="">Select senior</option>
                {seniors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {label(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="actions">
          <button disabled={!subject} onClick={() => setRun(true)}>
            Find Recommendations
          </button>
        </div>
        {subject && (
          <p>
            Recorded interests:{" "}
            {subject.interests.map((x) => x.interest.name).join(", ") ||
              "Not recorded. Add interests to produce relevant suggestions."}
          </p>
        )}
      </section>
      <p className="notice">
        Staff review is optional for interest suggestions. Unknown
        accessibility, language, schedules and registration are shown as
        unverified, with no positive suitability score.
      </p>
      <FilterBar
        search={f.q || ""}
        values={f}
        onChange={setF}
        options={[
          {
            key: "centre",
            label: "Centre",
            values: d.programmes.map((p) => p.centre),
          },
          {
            key: "category",
            label: "Domain",
            values: d.programmes.map((p) => p.category),
          },
          {
            key: "language",
            label: "Verified language",
            values: d.programmes
              .filter(
                (p) =>
                  p.review?.languageAssessment === "Assessed" || !p.external,
              )
              .flatMap((p) => p.languages.map((l) => l.language.name)),
          },
          {
            key: "day",
            label: "Day",
            values: d.programmes.flatMap((p) => [
              p.day,
              ...(p.external?.occurrences.map((o) => o.day) || []),
            ]),
          },
          {
            key: "venue",
            label: "Venue",
            values: d.programmes.flatMap((p) => [
              p.venue,
              ...(p.external?.occurrences.map((o) => o.venue) || []),
            ]),
          },
          {
            key: "availability",
            label: "Registration",
            values: ["Verified for registration"],
          },
        ]}
      />
      {run && (
        <>
          <p role="status">
            {results.length} interest-based suggestions for{" "}
            {target === "Care Recipient" ? "the senior" : "the caregiver"}.
            Relevance is separate from suitability and vacancies.
          </p>
          <div className="match-grid">
            {results.map((r) => {
              const next = nextOccurrence(r.p) || futureOccurrences(r.p)[0],
                filled =
                  r.p.registeredCount ??
                  r.p.participations.filter((p) => p.status === "Registered")
                    .length,
                canRegister =
                  registrationReady(r.p) &&
                  (!r.p.external ||
                    mobilityCompatible(subject!.mobility, r.p.mobility)) &&
                  (r.p.capacity === 0 || filled < r.p.capacity);
              return (
                <section className="panel match-card" key={r.p.id}>
                  <div className="section-head">
                    <h2>{r.p.name}</h2>
                    <Badge>{r.score}/100 Interest relevance</Badge>
                  </div>
                  <p>
                    <strong>Suggested by interests</strong>
                    {r.suitabilityVerified
                      ? " / Staff suitability review completed"
                      : " / Suitability not verified"}
                  </p>
                  <p>
                    {r.p.centre || "Centre not recorded"} / Domain:{" "}
                    {r.p.category || "Not recorded"}
                  </p>
                  <p>
                    Relevant tags: {r.tags.join(", ") || "No specific tags"}
                  </p>
                  <h3>Why this activity</h3>
                  <ul>
                    {r.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="match-schedule">
                    <strong>
                      {next
                        ? `${next.date} ${next.startTime}-${next.endTime}`
                        : r.p.external
                          ? "Schedule Not Confirmed"
                          : [r.p.day, r.p.startTime, r.p.endTime]
                              .filter(Boolean)
                              .join(" / ") || "Schedule Not Confirmed"}
                    </strong>
                    <span>
                      {next?.venue ||
                        r.p.venue ||
                        [
                          ...new Set(
                            r.p.external?.occurrences
                              .filter(
                                (o) => !o.missing && !explicitlyHidden(r.p, o),
                              )
                              .map((o) => o.venue)
                              .filter(Boolean),
                          ),
                        ].join(", ") ||
                        "Venue not confirmed"}
                    </span>
                    <span>Schedule: {scheduleLabel(r.p)}</span>
                    <span>Registration: {r.p.registrationStatus}</span>
                  </div>
                  {r.missing.length > 0 && (
                    <>
                      <details>
                        <summary>
                          Information not supplied by the programme
                        </summary>
                        <ul>
                          {r.missing
                            .filter(
                              (item) =>
                                item !== scheduleLabel(r.p) &&
                                !item.startsWith("Registration"),
                            )
                            .map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                        </ul>
                      </details>
                    </>
                  )}
                  <div className="actions">
                    <Link
                      className="secondary link-button"
                      href={`/programmes?q=${encodeURIComponent(r.p.name)}${r.p.external ? `&centre=${encodeURIComponent(r.p.external.centreId)}` : ""}`}
                    >
                      View Programme
                    </Link>
                    {write && (
                      <button
                        className="secondary"
                        disabled={!canRegister}
                        onClick={() =>
                          void action("participation", {
                            personId: subject!.id,
                            programmeId: r.p.id,
                            status: "Registered",
                          })
                        }
                      >
                        Register participation
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {!results.length && (
            <section className="panel empty">
              <h2>No relevant activities found</h2>
              <p>
                Record the selected participant interests or adjust centre and
                domain filters. Activities with an explicit audience or mobility
                incompatibility are excluded.
              </p>
              <button className="secondary" onClick={() => setF({})}>
                Reset Filters
              </button>
              <Link href="/programmes">View Programme Catalogue</Link>
            </section>
          )}
        </>
      )}
    </>
  );
}
