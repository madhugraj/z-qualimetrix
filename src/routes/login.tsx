import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import yavarLogo from "@/assets/yavar-logo.png.asset.json";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — QualiMetrix" },
      {
        name: "description",
        content:
          "Sign in to QualiMetrix with two-factor verification to access quality, defect and engineering health analytics.",
      },
      { property: "og:title", content: "Sign in — QualiMetrix" },
      {
        property: "og:description",
        content: "Two-factor sign in to the QualiMetrix quality intelligence platform.",
      },
    ],
  }),
  component: LoginPage,
});

// Mock-only authentication: no backend, no session. Any credentials pass, and the
// second factor accepts the demo code 123456.
const DEMO_CODE = "123456";

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter an email and password to continue");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setStep("otp");
      toast.success(`Verification code sent to ${email}`, {
        description: `Mock flow — use ${DEMO_CODE}`,
      });
    }, 650);
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (code !== DEMO_CODE) {
      toast.error("Invalid code", { description: `This is a mock — the code is ${DEMO_CODE}` });
      return;
    }
    setBusy(true);
    setTimeout(() => {
      toast.success("Verified — welcome back");
      navigate({ to: "/dashboard" });
    }, 500);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
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
          <img
            src={yavarLogo.url}
            alt="YAVAR logo"
            className="h-7 w-[48px] object-contain mix-blend-multiply"
          />
          <span className="text-sm font-semibold tracking-tight">QualiMetrix</span>
        </Link>
        <Link
          to="/"
          className="gloss gloss-hover ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 pb-16">
        <div className="gloss w-full max-w-md rounded-[2.25rem] p-8">
          <span className="gloss inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
            Mock sign-in · no live authentication
          </span>


          {step === "credentials" ? (
            <form onSubmit={submitCredentials} className="mt-6 space-y-5">
              <div>
                <h1 className="text-2xl font-semibold">Sign in</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use any email and password — this demo does not store credentials.
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

              <Button type="submit" className="w-full rounded-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="mt-6 space-y-5">
              <div>
                <h1 className="text-2xl font-semibold">Two-factor verification</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter the 6-digit code sent to{" "}
                  <span className="text-foreground">{email}</span>. Demo code:{" "}
                  <span className="font-medium text-primary">{DEMO_CODE}</span>
                </p>
              </div>

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button type="submit" className="w-full rounded-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Verify &amp; continue
                    <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setCode("");
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Use a different account
              </button>
            </form>
          )}
        </GlassPanel>
      </main>
    </div>
  );
}
