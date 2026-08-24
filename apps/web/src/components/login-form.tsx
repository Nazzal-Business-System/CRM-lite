"use client";

import { loginSchema } from "@nbs/shared";
import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/provider";
import { ApiError, isServiceUnavailable } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

export function LoginForm() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const emailIssue = parsed.error.issues.find((issue) =>
        issue.path.includes("email"),
      );
      const passwordIssue = parsed.error.issues.find((issue) =>
        issue.path.includes("password"),
      );
      setFieldErrors({
        email: emailIssue?.message,
        password: passwordIssue?.message,
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (caught) {
      setSubmitting(false);
      if (isServiceUnavailable(caught)) {
        setError(t("errors.connectFailed"));
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError(t("errors.requestFailed"));
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-1" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-foreground">
          {t("auth.email")}
          <span className="ms-0.5 text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> ({t("common.required")})</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby="email-error"
          disabled={submitting}
          className="h-11 rounded-lg border-border bg-background px-3 text-sm shadow-none"
        />
        <p id="email-error" className="min-h-5 text-sm text-destructive">
          {fieldErrors.email}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-foreground">
          {t("auth.password")}
          <span className="ms-0.5 text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> ({t("common.required")})</span>
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="password-error"
            disabled={submitting}
            className="h-11 rounded-lg border-border bg-background px-3 pe-12 text-sm shadow-none"
          />
          <button
            type="button"
            className="absolute top-1/2 end-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p id="password-error" className="min-h-5 text-sm text-destructive">
          {fieldErrors.password}
        </p>
      </div>
      <p className="min-h-5 text-sm text-destructive" role="alert">
        {error}
      </p>
      <Button
        type="submit"
        loading={submitting}
        className="mt-2 h-11 w-full"
      >
        {submitting ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
