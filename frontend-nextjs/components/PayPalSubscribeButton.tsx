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
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
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
          throw new Error(body.error || "Failed to create PayPal subscription.");
        }

        return body.id as string;
      },
      onApprove: (data: { subscriptionID?: string }) => {
        if (data?.subscriptionID && onSuccess) {
          onSuccess(data.subscriptionID);
        }
      },
      onError: (err: Error) => {
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
