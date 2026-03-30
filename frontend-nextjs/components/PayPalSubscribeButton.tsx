"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

declare global {
  interface Window {
    paypal?: any;
  }
}

type PayPalButtonProps = {
  planCode: string;
  disabled?: boolean;
  onSuccess?: (subscriptionId: string) => void;
  onError?: (message: string) => void;
};

export default function PayPalSubscribeButton({
  planCode,
  disabled,
  onSuccess,
  onError,
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!planCode || disabled) return;
    if (!containerRef.current) return;
    if (!window.paypal) return;

    containerRef.current.innerHTML = "";

    const button = window.paypal.Buttons({
      createSubscription: async () => {
        console.info("[PayPal] createSubscription starting", { planCode });
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          console.error("[PayPal] createSubscription missing session token");
          throw new Error("Please sign in again to continue.");
        }

        const response = await fetch("/api/billing/paypal/subscription", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ planCode }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.id) {
          console.error("[PayPal] createSubscription failed", {
            planCode,
            status: response.status,
            body,
          });
          throw new Error(body.error || "Failed to create PayPal subscription.");
        }

        console.info("[PayPal] createSubscription succeeded", {
          planCode,
          subscriptionId: body.id,
          status: body.status ?? null,
        });
        return body.id as string;
      },
      onApprove: (data: { subscriptionID?: string }) => {
        const run = async () => {
          console.info("[PayPal] onApprove received", {
            planCode,
            subscriptionId: data?.subscriptionID ?? null,
          });
          if (!data?.subscriptionID) return;

          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) {
            console.error("[PayPal] reconcile missing session token", {
              subscriptionId: data.subscriptionID,
            });
            throw new Error("Please sign in again to continue.");
          }

          const reconcileResponse = await fetch("/api/billing/paypal/reconcile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ subscriptionId: data.subscriptionID }),
          });

          const reconcileBody = await reconcileResponse.json().catch(() => ({}));
          if (!reconcileResponse.ok) {
            console.error("[PayPal] reconcile failed", {
              planCode,
              subscriptionId: data.subscriptionID,
              status: reconcileResponse.status,
              body: reconcileBody,
            });
            throw new Error(reconcileBody.error || "Failed to reconcile PayPal subscription.");
          }

          console.info("[PayPal] reconcile succeeded", {
            planCode,
            subscriptionId: data.subscriptionID,
            body: reconcileBody,
          });
          if (onSuccess) {
            onSuccess(data.subscriptionID);
          }
        };

        run().catch((err: unknown) => {
          console.error("[PayPal] onApprove flow failed", {
            planCode,
            subscriptionId: data?.subscriptionID ?? null,
            error: err instanceof Error ? err.message : String(err),
          });
          if (onError) {
            onError(err instanceof Error ? err.message : "PayPal reconciliation failed.");
          }
        });
      },
      onError: (err: Error) => {
        console.error("[PayPal] checkout error", {
          planCode,
          error: err?.message || "PayPal checkout failed.",
        });
        if (onError) {
          onError(err?.message || "PayPal checkout failed.");
        }
      },
      style: {
        layout: "vertical",
        shape: "rect",
        label: "subscribe",
      },
    });

    button.render(containerRef.current);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [planCode, disabled, onSuccess, onError]);

  return <div ref={containerRef} />;
}
