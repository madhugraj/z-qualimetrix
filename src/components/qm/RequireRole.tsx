import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

/** Route-level gate: renders children only for the listed roles, otherwise bounces to /dashboard. */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const authorized = !!user && roles.includes(user.role);

  useEffect(() => {
    if (!isLoading && !authorized) {
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, authorized, navigate]);

  if (isLoading || !authorized) return null;
  return <>{children}</>;
}
