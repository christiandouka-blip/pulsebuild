import { redirect } from "next/navigation";

import { CommandCenterShell } from "@/components/command-center/CommandCenterShell";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";

export const dynamic = "force-dynamic";

export default function HomePage() {
  if (isProductionRuntime()) {
    redirect("/projects");
  }
  return <CommandCenterShell />;
}
