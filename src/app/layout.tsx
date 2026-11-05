import type { Metadata } from "next";
import "./globals.css";
import DashboardApp from "@/components/app";
import {Suspense} from "react";
export const metadata: Metadata = {
  title: "P3H | Case Management",
  description: "Internal P3H management",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Suspense fallback={<div className="session-check" role="status">Checking secure session...</div>}><DashboardApp>{children}</DashboardApp></Suspense></body>
    </html>
  );
}
