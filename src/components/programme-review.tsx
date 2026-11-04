"use client";
import { useState } from "react";
import { Programme } from "@/lib/types";
import {
  reviewStatus,
  suitabilityIssues,
  sourceStates,
  eligibilityLabels,
  confirmedOccurrences,
} from "@/lib/programme-source";
import { Modal, ChipInput, Badge } from "./ui";
import { request } from "./common";
export type Vocabulary = {
  languages: string[];
  interests: string[];
  conditions: string[];
};
export function ProgrammeSessions({ p }: { p: Programme }) {
  if (!p.external)
    return (
      <p>
        {[p.day, p.startTime, p.endTime, p.venue, p.frequency]
          .filter(Boolean)
          .join(" / ") || "No upcoming sessions recorded"}
      </p>
    );
  const sessions = [...p.external.occurrences].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  );
  return (
    <details className="programme-sessions">
      <summary>
        View sessions ({confirmedOccurrences(p).length} confirmed upcoming)
      </summary>
      <ul>
        {sessions.map((o) => (
          <li key={o.id}>
            <strong>{o.date || "Date not confirmed"}</strong>{" "}
            {[o.startTime, o.endTime].filter(Boolean).join(" - ") ||
              "Time not confirmed"}
            <span>{o.venue || "Location not confirmed"}</span>
            <Badge>
              {o.missing
                ? "Missing from source"
                : eligibilityLabels[o.eligibilityStatus || "unverified"] ||
                  "Unverified"}
            </Badge>
            {Array.isArray(o.reasonCodes) && o.reasonCodes.length > 0 && (
              <small>
                {o.reasonCodes
                  .map(String)
                  .map((s) => s.replaceAll("_", " "))
                  .join("; ")}
              </small>
            )}
          </li>
        ))}
      </ul>
      {!sessions.length && <p>No upcoming sessions</p>}
    </details>
  );
}
export default function ProgrammeReview({
  p,
  vocabulary,
  write,
  onClose,
  onSaved,
}: {
  p: Programme;
  vocabulary: Vocabulary;
  write: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    audience: p.review?.audience || "",
    languages: p.languages.map((x) => x.language.name).join(", "),
    interests: p.interests.map((x) => x.interest.name).join(", "),
    conditions: p.conditions.map((x) => x.condition.name).join(", "),
    mobility: p.mobility,
    languageAssessment: p.review?.languageAssessment || "Not Assessed",
    interestAssessment: p.review?.interestAssessment || "Not Assessed",
    mobilityAssessment: p.review?.mobilityAssessment || "Not Assessed",
    conditionAssessment: p.review?.conditionAssessment || "Not Assessed",
    accessibility: p.review?.accessibility || "",
    intensity: p.review?.intensity || "Not Assessed",
    registrationStatus: p.registrationStatus,
    staffNotes: p.review?.staffNotes || "",
    description: p.description,
    notes: p.notes,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const preview = {
    ...p,
    ...values,
    languages: values.languages
      .split(/[,;\n]/)
      .filter((x) => x.trim())
      .map((name) => ({ language: { name } })),
    interests: values.interests
      .split(/[,;\n]/)
      .filter((x) => x.trim())
      .map((name) => ({ interest: { name } })),
    conditions: values.conditions
      .split(/[,;\n]/)
      .filter((x) => x.trim())
      .map((name) => ({ condition: { name } })),
    review: { ...p.review!, ...values, status: "In Review" },
  };
  const issues = suitabilityIssues(preview);
  const close = () => {
    if (!busy && (!write || window.confirm("Discard unsaved review changes?")))
      onClose();
  };
  const select = (
    key: keyof typeof values,
    label: string,
    options: string[],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        disabled={!write || busy}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value || "Select audience"}
          </option>
        ))}
      </select>
    </label>
  );
  const text = (key: keyof typeof values, label: string) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        maxLength={12000}
        disabled={!write || busy}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const save = async (decision: "draft" | "reviewed" | "information") => {
    setBusy(true);
    setError("");
    try {
      await request(`/api/programmes/${encodeURIComponent(p.id)}/review`, {
        decision,
        version: p.updatedAt,
        reviewVersion: p.review?.updatedAt ? String(p.review.updatedAt) : null,
        sourceFingerprint: p.external?.reviewFingerprint || "",
        values,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save review.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Review programme: ${p.name}`} onClose={close}>
      <div className="programme-review">
        <section className="review-source">
          <div className="section-head">
            <h3>{p.name}</h3>
            <Badge>{reviewStatus(p)}</Badge>
          </div>
          <p>
            {p.centre || "Shared manual programme"} /{" "}
            {p.category || "Category not recorded"}
          </p>
          <p>
            Source: {p.external ? "Program-SpaceBooking" : "Manual"} /{" "}
            {sourceStates(p)
              .map((s) => eligibilityLabels[s] || s)
              .join(", ")}
          </p>
          {p.external?.groupingStatus !== "Verified" && p.external && (
            <p className="notice">
              Series grouping is unverified. This source programme is kept
              separate from similarly named programmes.
            </p>
          )}
          {p.external && (
            <p>
              Source status: {p.external.sourceStatus || "Unverified"} /
              Scheduling:{" "}
              {p.external.occurrences.some(
                (o) => o.schedulingStatus === "required",
              )
                ? "Review required"
                : p.external.occurrences.some(
                      (o) => o.schedulingStatus === "verified",
                    )
                  ? "Verified by source"
                  : "Not verified"}
            </p>
          )}
          <ProgrammeSessions p={p} />
          {p.review?.reviewedAt && (
            <p>
              Last approval: {p.review.reviewedByName} /{" "}
              {new Date(String(p.review.reviewedAt)).toLocaleString("en-SG", {
                timeZone: "Asia/Singapore",
              })}
            </p>
          )}
        </section>
        {p.review &&
          Array.isArray(p.review.issues) &&
          p.review.issues.length > 0 && (
            <section className="notice">
              <strong>Saved review follow-up</strong>
              <ul>
                {p.review.issues.map((issue, i) => (
                  <li key={i}>{String(issue)}</li>
                ))}
              </ul>
            </section>
          )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <section
          className="review-gaps"
          aria-label="Outstanding suitability issues"
        >
          <h3>
            {issues.length
              ? `${issues.length} items to complete`
              : "Suitability fields complete"}
          </h3>
          {issues.length > 0 && (
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <p>
            Source eligibility, suitability review and registration availability
            are separate checks.
          </p>
        </section>
        <fieldset disabled={!write || busy}>
          <legend>Audience and communication</legend>
          <div className="form-grid">
            {select("audience", "Intended audience", [
              "",
              "Caregivers",
              "Care Recipients",
              "Both",
            ])}
            {select("languageAssessment", "Language assessment", [
              "Not Assessed",
              "Assessed",
            ])}
            <label>
              Languages supported
              <ChipInput
                label="Languages supported"
                value={values.languages}
                options={vocabulary.languages.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(v) =>
                  setValues((x) => ({
                    ...x,
                    languages: v,
                    languageAssessment: v.trim() ? "Assessed" : "Not Assessed",
                  }))
                }
              />
            </label>
            {select("interestAssessment", "Interest assessment", [
              "Not Assessed",
              "Assessed",
            ])}
            <label>
              Relevant interests
              <ChipInput
                label="Relevant interests"
                value={values.interests}
                options={vocabulary.interests.map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(v) =>
                  setValues((x) => ({
                    ...x,
                    interests: v,
                    interestAssessment: v.trim() ? "Assessed" : "Not Assessed",
                  }))
                }
              />
            </label>
          </div>
        </fieldset>
        <fieldset disabled={!write || busy}>
          <legend>Mobility and physical accessibility</legend>
          <div className="form-grid">
            {select("mobilityAssessment", "Mobility assessment", [
              "Not Assessed",
              "Assessed",
            ])}
            <label>
              Suitable mobility levels
              <ChipInput
                label="Suitable mobility levels"
                value={values.mobility}
                options={[
                  "Independent",
                  "Assisted",
                  "Wheelchair friendly",
                  "All",
                ].map((value) => ({ value, label: value }))}
                onChange={(v) =>
                  setValues((x) => ({
                    ...x,
                    mobility: v,
                    mobilityAssessment: v.trim() ? "Assessed" : "Not Assessed",
                  }))
                }
              />
            </label>
            {text("accessibility", "Physical accessibility and restrictions")}
            {select("intensity", "Activity intensity", [
              "Not Assessed",
              "Not Applicable",
              "Low",
              "Moderate",
              "High",
            ])}
          </div>
        </fieldset>
        <fieldset disabled={!write || busy}>
          <legend>Medical and care considerations</legend>
          <p>
            Choose Not Applicable for programmes without a condition-specific
            assessment. This does not establish medical suitability for
            everyone.
          </p>
          <div className="form-grid">
            {select("conditionAssessment", "Care considerations assessment", [
              "Not Assessed",
              "Not Applicable",
              "Assessed",
            ])}
            {values.conditionAssessment === "Assessed" && (
              <label>
                Assessed relevant conditions
                <ChipInput
                  label="Assessed relevant conditions"
                  value={values.conditions}
                  options={vocabulary.conditions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  onChange={(v) => change("conditions", v)}
                />
              </label>
            )}
          </div>
        </fieldset>
        <fieldset disabled={!write || busy}>
          <legend>Registration and staff information</legend>
          <p>
            Open means staff have independently confirmed registration
            availability. Room capacity and source pax do not establish
            vacancies.
          </p>
          <div className="form-grid">
            {select("registrationStatus", "Registration status", [
              "Unverified",
              "Open",
              "Closed",
              "Waitlist",
            ])}
            {text("staffNotes", "Staff review notes")}
            {text("description", "Additional programme information")}
            {text("notes", "Internal programme notes")}
          </div>
        </fieldset>
        <div className="actions review-actions">
          {write && (
            <>
              <button disabled={busy} onClick={() => void save("draft")}>
                Save Draft
              </button>
              <button
                disabled={busy || issues.length > 0}
                onClick={() => void save("reviewed")}
              >
                Mark as Reviewed
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void save("information")}
              >
                Needs Further Information
              </button>
            </>
          )}
          <button className="secondary" disabled={busy} onClick={close}>
            {write ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
