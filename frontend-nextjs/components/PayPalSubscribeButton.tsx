"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    paypal?: any;
  }
}

type PayPalButtonProps = {
  planId: string;
  disabled?: boolean;
  onSuccess?: (subscriptionId: string) => void;
  onError?: (message: string) => void;
};

export default function PayPalSubscribeButton({
  planId,
  disabled,
  onSuccess,
  onError,
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!planId || disabled) return;
    if (!containerRef.current) return;
    if (!window.paypal) return;

    containerRef.current.innerHTML = "";

    const button = window.paypal.Buttons({
      createSubscription: (_data: unknown, actions: { subscription: { create: (input: { plan_id: string }) => Promise<string> } }) =>
        actions.subscription.create({ plan_id: planId }),
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
  }, [planId, disabled, onSuccess, onError]);

  return <div ref={containerRef} />;
}
