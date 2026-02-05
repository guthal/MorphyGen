"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

type Plan = {
  name: string;
  price: string;
  credits: number;
  overage: string;
  bestFor: string;
  code: string;
  highlight?: boolean;
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
  },
  {
    name: "Boost ⭐",
    price: "$12.00 / month",
    credits: 2500,
    overage: "$0.015 / credit overage",
    bestFor: "Growing products & startups",
    highlight: true,
    code: "boost",
  },
  {
    name: "Growth",
    price: "$19.50 / month",
    credits: 5000,
    overage: "$0.0125 / credit overage",
    bestFor: "Production workloads",
    code: "growth",
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
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    };
    loadUser();
  }, []);

  useEffect(() => {
    const scriptId = "razorpay-checkout";
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const suggestedPlans = useMemo(() => {
    const sorted = [...PLANS].sort((a, b) => a.credits - b.credits);
    let index = sorted.findIndex((plan) => plan.credits >= consumption);
    if (index === -1) index = sorted.length - 1;
    const start = Math.max(0, index - 1);
    return sorted.slice(start, start + 3);
  }, [consumption]);

  const startCheckout = async (plan: Plan) => {
    if (plan.code === "free") {
      setNotice("Free plan is active by default.");
      return;
    }

    setNotice(null);
    setLoadingPlan(plan.code);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setNotice("Please sign in again to continue.");
        setLoadingPlan(null);
        return;
      }

      const response = await fetch("/api/billing/razorpay/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planCode: plan.code }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create subscription.");
      }

      const body = (await response.json()) as {
        keyId: string;
        subscriptionId: string;
      };

      if (!window.Razorpay) {
        throw new Error("Razorpay checkout not loaded.");
      }

      const razorpay = new window.Razorpay({
        key: body.keyId,
        subscription_id: body.subscriptionId,
        name: "MorphyGen",
        description: `${plan.name} plan`,
        prefill: {
          email: email ?? undefined,
        },
        theme: { color: "#ff7a1a" },
        handler: async (result: {
          razorpay_subscription_id?: string;
          razorpay_payment_id?: string;
          razorpay_signature?: string;
        }) => {
          await fetch("/api/billing/razorpay/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(result),
          });
          setNotice("Subscription activated. Thank you!");
        },
      });

      razorpay.open();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="section">
      <h2>Pricing</h2>
      <p>Choose a plan based on your monthly document volume.</p>

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
                  disabled={loadingPlan === plan.code}
                  onClick={() => startCheckout(plan)}
                >
                  {plan.code === "free"
                    ? "Included"
                    : loadingPlan === plan.code
                      ? "Starting checkout..."
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
                  disabled={loadingPlan === plan.code}
                  onClick={() => startCheckout(plan)}
                >
                  {plan.code === "free"
                    ? "Included"
                    : loadingPlan === plan.code
                      ? "Starting checkout..."
                      : "Subscribe"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
