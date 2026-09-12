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
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2.5">
        <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
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
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          disabled={submitting}
          className="h-12 rounded-lg border-input bg-background/55 px-3.5 text-sm shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:border-primary/60 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-[13px] leading-5 text-destructive">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>
      <div className="space-y-2.5">
        <Label htmlFor="password" className="text-[13px] font-medium text-foreground">
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
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            disabled={submitting}
            className="h-12 rounded-lg border-input bg-background/55 px-3.5 pe-12 text-sm shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:border-primary/60 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            className="absolute top-1/2 end-1.5 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-200 hover:bg-muted hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setShowPassword((value) => !value)}
            disabled={submitting}
            aria-pressed={showPassword}
            aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {fieldErrors.password ? (
          <p id="password-error" className="text-[13px] leading-5 text-destructive">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>
      {error ? (
        <p
          className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[13px] leading-5 text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        loading={submitting}
        className="h-12 w-full rounded-lg shadow-sm transition-[color,background-color,box-shadow,transform,opacity] hover:shadow-md active:translate-y-px"
      >
        {submitting ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
