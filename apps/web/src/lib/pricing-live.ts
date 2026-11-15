import { useEffect, useState } from "react";
import { nativeCalculationOptions, type NativeBookReference } from "./price-book-pricing";
import type { AuthUser, PricingCurrency } from "@nbs/shared";
import { canViewPricing, pricingCalculationOptions, pricingConfigurationKey, type EstimateSnapshot } from "./pricing";

export type LivePricingState = { key: string | null; status: "idle" | "loading" | "success" | "error"; estimate: EstimateSnapshot | null; error: unknown };
export function isCurrentPricing(state: LivePricingState, key: string | null) {
  return !!key && state.key === key && state.status === "success" && !!state.estimate;
}
// Injectable scheduling boundary for isolated tests; late responses cannot replace a newer selection.
export function schedulePricing(key: string, calculate: () => Promise<{ estimate: EstimateSnapshot }>, publish: (value: Partial<LivePricingState>) => void, delay = 350) {
  let active = true;
  const timer = setTimeout(() => {
    if (!active) return;
    publish({ status: "loading", error: null });
    void calculate().then(({ estimate }) => { if (active) publish({ key, status: "success", estimate, error: null }); }, error => { if (active) publish({ status: "error", error }); });
  }, delay);
  return () => { active = false; clearTimeout(timer); };
}
export function useLivePricing(user: AuthUser | null, configuration: unknown, currency: PricingCurrency = "JOD", revision = "", nativeBook?: NativeBookReference | null) {
  const configurationKey = pricingConfigurationKey(configuration);
  const key = nativeBook === null ? null : configurationKey ? (nativeBook ? nativeBook.id + ":" + nativeBook.version : currency + ":" + revision) + ":" + configurationKey : null;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LivePricingState>({ key: null, status: "idle", estimate: null, error: null });
  useEffect(() => {
    if (!key || !canViewPricing(user)) return;
    return schedulePricing(key, () => (nativeBook ? nativeCalculationOptions(user,nativeBook) : pricingCalculationOptions(user,currency)).mutationFn(JSON.parse(configurationKey!)), patch => setState(value => ({ ...value, ...patch })));
  }, [key, configurationKey, currency, revision, nativeBook, user, retry]);
  return { ...state, configurationKey: key, current: isCurrentPricing(state, key), retry: () => setRetry(value => value + 1) };
}
