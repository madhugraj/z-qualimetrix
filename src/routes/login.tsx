import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/qm/ThemeToggle";
import { API_V1_URL } from "@/lib/api-config";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — QubeIQ" },
      {
        name: "description",
        content:
          "Sign in to QubeIQ with two-factor verification to access quality, defect and engineering health analytics.",
      },
      { property: "og:title", content: "Sign in — QubeIQ" },
      {
        property: "og:description",
        content: "Two-factor sign in to the QubeIQ quality intelligence platform.",
      },
    ],
  }),
  component: LoginPage,
});

// Real authentication with session cookies. User must exist in database with
// password set (admin-created) and have tenantId assigned.
function LoginPage() {
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter an email and password to continue");
      return;
    }
    setBusy(true);

    try {
      const response = await fetch(`${API_V1_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Login failed');
        setBusy(false);
        return;
      }

      toast.success(`Welcome back, ${result.user.name || result.user.email}`);
      await refetch();
      navigate({ to: "/dashboard" });
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Unable to connect to authentication service');
      setBusy(false);
    }
  }

  return (
    <div className="qm-page-canvas relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div
        className="gloss-bloom -top-40 -left-32 h-[32rem] w-[32rem]"
        style={{ background: "radial-gradient(circle, oklch(0.82 0.11 70 / 45%), transparent 70%)" }}
      />
      <div
        className="gloss-bloom -right-32 bottom-0 h-[28rem] w-[28rem]"
        style={{ background: "radial-gradient(circle, oklch(0.86 0.06 190 / 40%), transparent 70%)" }}
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
            <span className="text-xs font-bold text-primary-foreground">Q</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">QubeIQ</span>
        </Link>
        <ThemeToggle className="ml-auto" />
        <Link
          to="/"
          className="gloss gloss-hover inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-16">
        <div className="gloss w-full max-w-md rounded-[2.25rem] p-8">
          <span className="gloss inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            Secure authentication
          </span>

          <form onSubmit={submitCredentials} className="mt-6 space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">Sign in</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your credentials to access your workspace.
              </p>
            </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yavar.ai"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="gloss-cta w-full rounded-full border-0" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                  </>
                )}
              </Button>
            </form>
        </div>
      </main>
    </div>
  );
}
