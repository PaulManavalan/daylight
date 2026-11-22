import type { ReactNode } from "react";
import { AccountWorkspaceProvider } from "@/components/account-workspace-context";
export default function DayLayout({ children }: { children: ReactNode }) {
  return <AccountWorkspaceProvider>{children}</AccountWorkspaceProvider>;
}
