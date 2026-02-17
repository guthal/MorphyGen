"use client";

import { useEffect, useMemo, useState } from "react";
import PayPalSubscribeButton from "@/components/PayPalSubscribeButton";
import { supabase } from "../../lib/supabaseClient";

type Plan = {
  name: string;
  price: string;
  credits: number;
  overage: string;
  bestFor: string;
  code: string;
  highlight?: boolean;
  paypalPlanId?: string;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0 / month",
    credits: 50,
    overage: "No overage",
    bestFor: "Testing & prototyping",
    code: "free",
  },
  {
    name: "Starter",
    price: "$4.50 / month",
    credits: 500,
    overage: "$0.02 / credit overage",
    bestFor: "Small apps & side projects",
    code: "starter",
    paypalPlanId: "P-0XY03120C1232724FNGJA4CI",
  },
  {
    name: "Boost ⭐",
    price: "$12.00 / month",
    credits: 2500,
    overage: "$0.015 / credit overage",
    bestFor: "Growing products & startups",
    highlight: true,
    code: "boost",
    paypalPlanId: "P-1GT40783XG644073RNGJBD7I",
  },
  {
    name: "Growth",
    price: "$19.50 / month",
    credits: 5000,
    overage: "$0.0125 / credit overage",
    bestFor: "Production workloads",
    code: "growth",
    paypalPlanId: "P-4MB78084NA7584847NGJBEFQ",
  },
  {
    name: "Scale 25K",
    price: "$49.50 / month",
    credits: 25000,
    overage: "$0.01 / credit overage",
    bestFor: "High-volume pipelines",
    code: "scale_25k",
  },
  {
    name: "Scale 50K",
    price: "$74.50 / month",
    credits: 50000,
    overage: "$0.01 / credit overage",
    bestFor: "SaaS platforms",
    code: "scale_50k",
  },
  {
    name: "Scale 100K",
    price: "$124.50 / month",
    credits: 100000,
    overage: "$0.005 / credit overage",
    bestFor: "Enterprise integrations",
    code: "scale_100k",
  },
  {
    name: "Scale 250K",
    price: "$249.50 / month",
    credits: 250000,
    overage: "$0.005 / credit overage",
    bestFor: "Heavy batch processing",
    code: "scale_250k",
  },
  {
    name: "Scale 500K",
    price: "$374.50 / month",
    credits: 500000,
    overage: "$0.005 / credit overage",
    bestFor: "Large-scale automation",
    code: "scale_500k",
  },
  {
    name: "Scale 1M",
    price: "$499.50 / month",
    credits: 1000000,
    overage: "$0.005 / credit overage",
    bestFor: "Very high throughput systems",
    code: "scale_1m",
  },
];

const formatCredits = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

export default function PricingPage() {
  const [consumption, setConsumption] = useState(2500);
  const [notice, setNotice] = useState<string | null>(null);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isPaidUser, setIsPaidUser] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setHasSession(Boolean(data.session));
      }
    };
    const loadBilling = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (isMounted) {
            setIsPaidUser(false);
            setLoadingBilling(false);
          }
          return;
        }
        const response = await fetch("/api/billing/usage", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          if (isMounted) {
            setIsPaidUser(false);
            setLoadingBilling(false);
          }
          return;
        }
        const body = (await response.json()) as { planCode?: string; status?: string };
        const paid =
          Boolean(body.planCode && body.planCode !== "free") &&
          String(body.status || "").toUpperCase() !== "FREE";
        if (isMounted) {
          setIsPaidUser(paid);
          setLoadingBilling(false);
        }
      } catch {
        if (isMounted) {
          setIsPaidUser(false);
          setLoadingBilling(false);
        }
      }
    };
    const loadSdk = async () => {
      try {
        const response = await fetch("/api/paypal/client-id");
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load PayPal client id.");
        }
        const body = (await response.json()) as { clientId: string };
        const scriptId = "paypal-sdk";
        if (document.getElementById(scriptId)) {
          if (isMounted) setPaypalReady(true);
          return;
        }
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://www.paypal.com/sdk/js?client-id=${body.clientId}&vault=true&intent=subscription&debug=true`;
        script.async = true;
        script.onload = () => {
          if (isMounted) setPaypalReady(true);
        };
        script.onerror = () => {
          if (isMounted) setPaypalError("Failed to load PayPal checkout.");
        };
        document.body.appendChild(script);
      } catch (error) {
        if (isMounted) {
          setPaypalError(error instanceof Error ? error.message : "PayPal init failed.");
        }
      }
    };
    loadBilling();
    loadSession();
    loadSdk();

    return () => {
      isMounted = false;
    };
  }, []);

  const suggestedPlans = useMemo(() => {
    const sorted = [...PLANS].sort((a, b) => a.credits - b.credits);
    let index = sorted.findIndex((plan) => plan.credits >= consumption);
    if (index === -1) index = sorted.length - 1;
    const start = Math.max(0, index - 1);
    return sorted.slice(start, start + 3);
  }, [consumption]);

  const handleSuccess = (subscriptionId: string) => {
    setNotice(`Subscription created: ${subscriptionId}`);
    setSelectedPlan(null);
  };
  const handleSelectPlan = (plan: Plan) => {
    if (plan.code === "free") return;
    if (!hasSession) {
      const next = encodeURIComponent(`/pricing?plan=${plan.code}`);
      window.location.href = `/login?next=${next}`;
      return;
    }
    setSelectedPlan(plan);
  };
  const handleFallback = async (plan: Plan) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setNotice("Please sign in again to continue.");
        return;
      }
      const response = await fetch("/api/billing/paypal/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planCode: plan.code }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to create subscription.");
      }
      const url = body.approveUrl as string | undefined;
      setApprovalUrl(url ?? null);
      if (url) {
        const popup = window.open(url, "_blank", "noopener,noreferrer");
        if (popup) {
          setNotice("Approval opened in a new tab.");
        } else {
          setNotice("Popup blocked. Use the approval link below.");
        }
      } else {
        setNotice("Subscription created. Approval required.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Checkout failed.");
    }
  };

  return (
    <section className="section">
      <h2>Pricing</h2>
      <p>Choose a plan based on your monthly document volume.</p>
      {paypalError ? (
        <div className="card" style={{ marginTop: "16px" }}>
          <p className="notice">{paypalError}</p>
        </div>
      ) : null}

      <div className="grid" style={{ marginTop: "24px" }}>
        <div className="card">
          <span className="badge">How credits work</span>
          <h3>Unified credits</h3>
          <p>
            1 credit = 1 document, assuming the output is up to 5 MB. Larger
            files consume multiple credits. Example: a 12 MB PDF = 3 credits.
          </p>
        </div>
        <div className="card">
          <span className="badge">Pricing</span>
          <h3>Usage-based scaling</h3>
          <p>
            Credits are shared across HTML → PDF, OCR, and future document
            services. Overage rates drop as you scale.
          </p>
        </div>
      </div>

      {notice ? (
        <div className="card" style={{ marginTop: "24px" }}>
          <p className="notice">{notice}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Plan recommendations</h3>
        <div style={{ marginTop: "12px" }}>
          <label style={{ fontWeight: 600 }}>
            Estimated monthly consumption (credits)
          </label>
          <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
            <input
              type="range"
              min={50}
              max={1000000}
              step={50}
              value={consumption}
              onChange={(event) =>
                setConsumption(Number.parseInt(event.target.value, 10))
              }
            />
            <input
              type="number"
              value={consumption}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(next)) {
                  setConsumption(Math.min(Math.max(next, 50), 1000000));
                }
              }}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                font: "inherit",
                width: "200px",
              }}
            />
            <div style={{ color: "var(--soft-ink)" }}>
              Showing recommendations for ~{formatCredits(consumption)} credits
              / month.
            </div>
          </div>
        </div>
        <div className="grid" style={{ marginTop: "16px" }}>
          {suggestedPlans.map((plan) => (
            <div
              key={plan.name}
              className="card"
              style={plan.highlight ? { borderColor: "#ffd9b8" } : undefined}
            >
              <span className="badge">{plan.name}</span>
              <h3>{plan.price}</h3>
              <p>
                {formatCredits(plan.credits)} credits · {plan.overage}
              </p>
              <p>{plan.bestFor}</p>
              <div style={{ marginTop: "12px" }}>
                <button
                  className="button primary"
                  type="button"
                  disabled={plan.code === "free" || loadingBilling}
                  onClick={() => handleSelectPlan(plan)}
                >
                  {plan.code === "free"
                    ? "Included"
                    : isPaidUser
                      ? "Upgrade"
                      : "Subscribe"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>All plans</h3>
        <div className="grid" style={{ marginTop: "16px" }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="card"
              style={plan.highlight ? { borderColor: "#ffd9b8" } : undefined}
            >
              <span className="badge">{plan.name}</span>
              <h3>{plan.price}</h3>
              <p>
                {formatCredits(plan.credits)} credits · {plan.overage}
              </p>
              <p>{plan.bestFor}</p>
              <div style={{ marginTop: "12px" }}>
                <button
                  className="button"
                  type="button"
                  disabled={plan.code === "free" || loadingBilling}
                  onClick={() => handleSelectPlan(plan)}
                >
                  {plan.code === "free"
                    ? "Included"
                    : isPaidUser
                      ? "Upgrade"
                      : "Subscribe"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedPlan ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3>{selectedPlan.name}</h3>
                <p className="modal-subtitle">{selectedPlan.price}</p>
              </div>
              <button
                className="button"
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setApprovalUrl(null);
                }}
              >
                Close
              </button>
            </div>
            {selectedPlan.code === "free" ? (
              <p>This plan is included by default.</p>
            ) : selectedPlan.paypalPlanId && paypalReady ? (
              <PayPalSubscribeButton
                planId={selectedPlan.paypalPlanId}
                onSuccess={handleSuccess}
                onError={(message) => setNotice(message)}
              />
            ) : paypalError ? (
              <p className="notice">{paypalError}</p>
            ) : (
              <div>
                <p>Direct checkout failed. Use the approval link fallback.</p>
                <button
                  className="button"
                  type="button"
                  onClick={() => handleFallback(selectedPlan)}
                >
                  Open approval link
                </button>
              </div>
            )}
            {approvalUrl ? (
              <div className="modal-approval">
                <p>Approval required. Use this link if the popup was blocked:</p>
                <a href={approvalUrl} target="_blank" rel="noreferrer">
                  {approvalUrl}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
