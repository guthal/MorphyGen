"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

export default function BillingPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    planCode: string;
    planCredits: number;
    creditsUsed: number;
    creditsRemaining: number;
    periodStart: string | null;
    periodEnd: string | null;
    status: string;
  } | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const isAdminMode = Boolean(adminEmail) && email === adminEmail;

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadUsage = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/billing/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) return;
      const body = (await response.json()) as typeof usage;
      setUsage(body);
    };
    loadUsage();
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

  const currentPlan = PLANS[0];
  const featuredPlan = PLANS.find((plan) => plan.code === "boost") ?? PLANS[1];

  const startCheckout = async (plan: Plan) => {
    if (plan.code === "free") {
      setNotice("Free plan is active by default.");
      return;
    }

    setNotice(null);
    setLoadingPlan(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setNotice("Please sign in again to continue.");
        setLoadingPlan(false);
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
      setLoadingPlan(false);
    }
  };
  return (
    <section className="section">
      <h2>Billing</h2>
      <p>Review your current plan, credits, and upgrade options.</p>

      <div className="card" style={{ marginTop: "24px" }}>
        <span className="badge">Current plan</span>
        <h3>{currentPlan.name}</h3>
        <p>
          Every account starts on the Free plan. Perfect for testing and
          prototyping.
        </p>
        {notice ? <p className="notice">{notice}</p> : null}
        {usage ? (
          <div style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
            <div>
              <strong>Usage:</strong> {usage.creditsUsed.toLocaleString()} /{" "}
              {usage.planCredits.toLocaleString()} credits
            </div>
            <div>
              <strong>Remaining:</strong>{" "}
              {usage.creditsRemaining.toLocaleString()} credits
            </div>
            {usage.periodStart && usage.periodEnd ? (
              <div>
                <strong>Cycle:</strong>{" "}
                {new Date(usage.periodStart).toLocaleDateString()} –{" "}
                {new Date(usage.periodEnd).toLocaleDateString()}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="button primary"
            type="button"
            onClick={() => setShowPicker((prev) => !prev)}
          >
            {showPicker ? "Hide plans" : "Upgrade now"}
          </button>
          <a className="button" href="/dashboard/pricing">
            View all plans
          </a>
        </div>
        {showPicker ? (
          <div className="grid" style={{ marginTop: "16px" }}>
            {PLANS.filter((plan) => plan.code !== "free").map((plan) => (
              <div
                key={plan.name}
                className="card"
                style={plan.highlight ? { borderColor: "#ffd9b8" } : undefined}
              >
                <span className="badge">{plan.name}</span>
                <h3>{plan.price}</h3>
                <p>
                  {plan.credits.toLocaleString()} credits · {plan.overage}
                </p>
                <p>{plan.bestFor}</p>
                <div style={{ marginTop: "12px" }}>
                  <button
                    className="button primary"
                    type="button"
                    disabled={loadingPlan}
                    onClick={() => startCheckout(plan)}
                  >
                    {loadingPlan ? "Starting checkout..." : "Subscribe"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: "24px" }}>
        <h3>Need a custom plan?</h3>
        <p>
          Reach out if you need higher throughput, dedicated capacity, or custom
          SLAs.
        </p>
        <div style={{ marginTop: "16px" }}>
          <a className="button primary" href="mailto:masuvi1970@gmail.com">
            Contact sales
          </a>
        </div>
      </div>

      {isAdminMode ? (
        <div className="card" style={{ marginTop: "24px" }}>
          <h3>Integration checklist</h3>
          <p>
            Configure Razorpay keys and set the webhook URL to receive all
            payment events.
          </p>
          <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
            <div>• RAZORPAY_KEY_ID</div>
            <div>• RAZORPAY_KEY_SECRET</div>
            <div>• RAZORPAY_WEBHOOK_SECRET</div>
            <div>• RAZORPAY_PLAN_MAP (JSON plan code → Razorpay plan_id)</div>
            <div>• Webhook URL: /api/billing/razorpay/webhook</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
