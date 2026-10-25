import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Daylight · A little more space in your day", description: "A thoughtful student planner for school, side projects, and everything in between." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
