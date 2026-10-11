"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Data, label } from "@/lib/types";
import { match, MatchPerson } from "@/lib/domain";
import { Table, Badge } from "./ui";
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
    [f, setF] = useState<Filters>({});
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
            p.status === "Active" &&
            (!f.centre || p.centre === f.centre) &&
            (!f.language || names(p).languages.includes(f.language)) &&
            (!f.category || p.category === f.category) &&
            (!f.day || p.day === f.day) &&
            (!f.venue || p.venue === f.venue) &&
            (!f.availability ||
              (p.registrationStatus === "Open" &&
                (p.capacity === 0 ||
                  p.participations.filter((x) => x.status === "Registered")
                    .length < p.capacity))),
        )
        .map((p) => ({
          p,
          ...match(
            names(member) as MatchPerson,
            recipient ? names(recipient) : undefined,
            names(p),
          ),
        }))
        .sort((a, b) => b.score - a.score)
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
          <Table
            headers={[
              "Programme / Match",
              "Reasons",
              "Schedule / venue",
              "Action",
            ]}
            rows={results
              .filter(
                ({ p }) =>
                  !f.q || p.name.toLowerCase().includes(f.q.toLowerCase()),
              )
              .map((r, i) => ({
                id: r.p.id,
                sort: String(i).padStart(5, "0"),
                cells: [
                  <span key="name">
                    <strong>{r.p.name}</strong>
                    <br />
                    <Badge>{r.score}% Match</Badge>
                  </span>,
                  <ul key="reasons">
                    {r.reasons.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>,
                  `${r.p.day} ${r.p.startTime}–${r.p.endTime} · ${r.p.venue || "Venue not recorded"} · ${r.p.registrationStatus}`,
                  write ? (
                    <button
                      key="register"
                      className="secondary"
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
                  ) : (
                    "View only"
                  ),
                ],
              }))}
          />
        </>
      )}
    </>
  );
}
