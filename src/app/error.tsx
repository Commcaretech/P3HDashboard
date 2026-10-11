"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <h1>Unable to open this page</h1>
      <p>Your records are stored locally. Try loading the page again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
