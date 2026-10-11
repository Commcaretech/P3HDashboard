import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "P3H | Case Management",
  description: "Local internal P3H management",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
