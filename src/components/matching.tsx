"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Data, label } from "@/lib/types";
import { match, MatchPerson } from "@/lib/domain";
import {
  needsReview,
  nextOccurrence,
  recommendationReady,
  sourceCentres,
} from "@/lib/programme-source";
import { compareRecommendations } from "@/lib/matching";
import Link from "next/link";
import { Badge } from "./ui";
import { Filters, FilterBar, names } from "./common";
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
  const [memberId, setMember] = useState(params.get("member") ?? ""),
    [recipientId, setRecipient] = useState(""),
    [run, setRun] = useState(false),
    [f, setF] = useState<Filters>({
      centre:
        sourceCentres[params.get("centre") || ""] || params.get("centre") || "",
    });
  const member = d.people.find((p) => p.id === memberId),
    recipient = d.people.find((p) => p.id === recipientId);
  const members = d.people.filter(
    (p) => p.kind === "Member" && p.status === "Active",
  );
  const linked =
    member?.caregiverLinks
      .map((l) => d.people.find((p) => p.id === l.recipientId)!)
      .filter((p) => p.status === "Active") ?? [];
  const results = member
    ? d.programmes
        .filter(
          (p) =>
            recommendationReady(p) &&
            (!p.external ||
              !p.review ||
              p.review.audience === "Both" ||
              p.review.audience ===
                (recipient ? "Care Recipients" : "Caregivers")) &&
            (!f.centre || p.centre === f.centre) &&
            (!f.language || names(p).languages.includes(f.language)) &&
            (!f.category || p.category === f.category) &&
            (!f.day || p.day === f.day) &&
            (!f.venue || p.venue === f.venue) &&
            (!f.availability ||
              (p.registrationStatus === "Open" &&
                (p.capacity === 0 ||
                  (p.registeredCount ??
                    p.participations.filter((x) => x.status === "Registered")
                      .length) < p.capacity))),
        )
        .map((p) => ({
          p,
          ...match(
            names(member) as MatchPerson,
            recipient ? names(recipient) : undefined,
            {
              ...names(p),
              conditions:
                p.review?.conditionAssessment === "Not Applicable"
                  ? []
                  : names(p).conditions,
              conditionAssessment: p.review?.conditionAssessment,
              imported: Boolean(p.external),
              reviewRequired: needsReview(p),
            },
          ),
        }))
        .sort(
          (a, b) =>
            compareRecommendations(a, b) || a.p.name.localeCompare(b.p.name),
        )
    : [];
  return (
    <>
      <section className="panel">
        <h2>Find suitable programmes</h2>
        <p>
          Condition 35% · Language 25% · Member interests 15% · Care recipient
          interests 15% · Mobility 10%. Missing information earns no points.
        </p>
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
              <option value="">Select member</option>
              {members.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Linked care recipient
            <select
              aria-label="Linked care recipient"
              value={recipientId}
              onChange={(e) => {
                setRecipient(e.target.value);
                setRun(false);
              }}
            >
              <option value="">Member only (recipient data missing)</option>
              {linked.map((p) => (
                <option key={p.id} value={p.id}>
                  {label(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions">
          <button disabled={!member} onClick={() => setRun(true)}>
            Find Suitable Programmes
          </button>
        </div>
      </section>
      <p className="notice">
        Imported recommendations require confirmed future sessions, verified
        source scheduling and completed suitability review. Registration
        availability is shown separately. No travel times are assumed.
      </p>
      {d.programmes.some((p) => p.external && !recommendationReady(p)) && (
        <p className="muted">
          {
            d.programmes.filter((p) => p.external && !recommendationReady(p))
              .length
          }{" "}
          imported programmes are excluded pending suitability or source
          scheduling checks. Review them in the Programme Catalogue.
        </p>
      )}
      <FilterBar
        search={f.q ?? ""}
        values={f}
        onChange={setF}
        options={[
          {
            key: "centre",
            label: "Centre",
            values: d.programmes.map((p) => p.centre),
          },
          {
            key: "language",
            label: "Language",
            values: d.programmes.flatMap((p) => names(p).languages),
          },
          {
            key: "category",
            label: "Category",
            values: d.programmes.map((p) => p.category),
          },
          { key: "day", label: "Day", values: d.programmes.map((p) => p.day) },
          {
            key: "venue",
            label: "Venue",
            values: d.programmes.map((p) => p.venue),
          },
          { key: "availability", label: "Availability", values: ["Available"] },
        ]}
      />
      {run && (
        <>
          <p>
            {results.length} recommendations. Scores describe recorded
            compatibility; staff should confirm individual needs.
          </p>
          <div className="match-grid">
            {results
              .filter(
                ({ p }) =>
                  !f.q || p.name.toLowerCase().includes(f.q.toLowerCase()),
              )
              .map((r, i) => {
                const filled =
                  r.p.registeredCount ??
                  r.p.participations.filter((x) => x.status === "Registered")
                    .length;
                return (
                  <section
                    className={`panel match-card ${!r.eligible ? "ineligible" : ""}`}
                    key={r.p.id}
                  >
                    <div className="section-head">
                      <h2>
                        {i + 1}. {r.p.name}
                      </h2>
                      <Badge>
                        {r.eligible
                          ? `${r.score}% ${r.p.external ? "Compatibility" : "Match"}`
                          : "Needs review / Not Recommended"}
                      </Badge>
                    </div>
                    <p>
                      Data confidence: <strong>{r.confidence}</strong> (
                      {r.confidenceScore}% complete)
                    </p>
                    {r.missing.length > 0 && (
                      <p className="muted">Missing: {r.missing.join(", ")}</p>
                    )}
                    <ul>
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    <div className="match-schedule">
                      <strong>
                        {r.p.external
                          ? nextOccurrence(r.p)
                            ? `${nextOccurrence(r.p)!.date} ${nextOccurrence(r.p)!.startTime}-${nextOccurrence(r.p)!.endTime}`
                            : "No confirmed upcoming session"
                          : `${r.p.day} ${r.p.startTime}-${r.p.endTime}`}
                      </strong>
                      <span>
                        {(r.p.external
                          ? nextOccurrence(r.p)?.venue
                          : r.p.venue) || "Venue not recorded"}{" "}
                        · {r.p.centre || "All centres"}
                      </span>
                      <span>
                        {r.p.frequency || "Frequency not recorded"} ·{" "}
                        {r.p.capacity
                          ? `${filled} / ${r.p.capacity} places filled`
                          : `${filled} registered · capacity not recorded`}
                      </span>
                      <Badge>{r.p.registrationStatus}</Badge>
                      {r.p.external && (
                        <p>
                          Program-SpaceBooking | Compatibility does not confirm
                          registration availability. Staff review required.
                        </p>
                      )}
                    </div>
                    <div className="actions">
                      <Link
                        className="secondary link-button"
                        href={`/programmes?q=${encodeURIComponent(r.p.name)}`}
                      >
                        View Programme
                      </Link>
                      {write && (
                        <button
                          className="secondary"
                          disabled={
                            !r.eligible ||
                            Boolean(
                              r.p.external &&
                              (!nextOccurrence(r.p) || needsReview(r.p)),
                            ) ||
                            r.p.registrationStatus !== "Open" ||
                            (r.p.capacity > 0 && filled >= r.p.capacity)
                          }
                          onClick={() =>
                            void action("participation", {
                              personId: recipientId || memberId,
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
              <h2>No suitable programmes found.</h2>
              <p>
                Review your filters and the recorded language and mobility
                requirements.
              </p>
              <button className="secondary" onClick={() => setF({})}>
                Review Filters
              </button>{" "}
              <Link href="/programmes">View All Programmes</Link>
            </section>
          )}
        </>
      )}
    </>
  );
}
