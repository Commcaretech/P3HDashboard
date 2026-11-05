"use client";
import { useState } from "react";
import type { Programme } from "@/lib/types";
import { programmeInterestEvidence } from "@/lib/programme-interests";
import { Modal, ChipInput } from "./ui";
import { request } from "./common";
export default function ProgrammeInterestTags({
  p,
  vocabulary,
  onClose,
  onSaved,
}: {
  p: Programme;
  vocabulary: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const evidence = programmeInterestEvidence(p),
    [tags, setTags] = useState(evidence.tags.join(", ")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={`Interest tags: ${p.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Source domain: <strong>{p.category || "Not recorded"}</strong>. The
        source domain is preserved. These tags describe interests, not medical
        suitability.
      </p>
      <p>
        Name/domain suggestions:{" "}
        {evidence.suggested.join(", ") || "No specific tags found"}
      </p>
      <label>
        Interest tags
        <ChipInput
          label="Interest tags"
          value={tags}
          options={vocabulary.map((value) => ({ value, label: value }))}
          onChange={setTags}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await request(`/api/programmes/${p.id}/interests`, {
                version: p.updatedAt,
                tags: [
                  ...new Set(
                    tags
                      .split(/[,;\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ],
              });
              await onSaved();
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to save tags");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving..." : "Save interest tags"}
        </button>
        <button className="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
