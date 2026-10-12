"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
type Result = {
  id: string;
  title: string;
  detail: string;
  group: string;
  href: string;
};
export default function GlobalSearch() {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) throw new Error();
        const j = await r.json();
        setResults(j.results);
        setError("");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError(
            "Search unavailable. Press Enter to retry on the search page.",
          );
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  return (
    <form
      className="global-search"
      action="/search"
      onSubmit={() => setOpen(false)}
    >
      <Search size={18} />
      <input
        name="q"
        placeholder="Search people and programmes…"
        aria-label="Global search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && q.length >= 2}
        aria-controls="search-results"
        aria-activedescendant={
          active >= 0 ? `search-result-${active}` : undefined
        }
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(Math.min(results.length - 1, active + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(0, active - 1));
          }
          if (e.key === "Enter" && active >= 0 && results[active]) {
            e.preventDefault();
            router.push(results[active].href);
            setOpen(false);
          }
        }}
      />
      {open && q.length >= 2 && (
        <div className="search-results" id="search-results" role="listbox">
          {error && <p role="status">{error}</p>}
          {results.length ? (
            results.map((r, i) => (
              <div key={r.id}>
                {(i === 0 || results[i - 1].group !== r.group) && (
                  <h3>{r.group}</h3>
                )}
                <Link
                  href={r.href}
                  id={`search-result-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onClick={() => setOpen(false)}
                >
                  {r.title}
                  <small>{r.detail}</small>
                </Link>
              </div>
            ))
          ) : (
            <p>No matching results.</p>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => setOpen(false)}
          >
            Close search
          </button>
        </div>
      )}
    </form>
  );
}
