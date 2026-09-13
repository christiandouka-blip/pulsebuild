"use client";

import { Button } from "@/components/layout/Button";
import { signOutAction } from "@/lib/auth/actions";

export function SignOutButton({
  size = "sm",
}: {
  size?: "sm" | "md";
} = {}) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size={size}>
        Sign out
      </Button>
    </form>
  );
}
