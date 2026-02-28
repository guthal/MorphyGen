import { paypalGet } from "@/lib/paypalAdmin";

type TransactionAmount = {
  currency_code?: string;
  value?: string;
};

type PayPalSubscriptionTransaction = {
  id?: string;
  status?: string;
  time?: string;
  payer_email?: string;
  payer_name?: {
    given_name?: string;
    surname?: string;
    full_name?: string;
  };
  amount_with_breakdown?: {
    gross_amount?: TransactionAmount;
    net_amount?: TransactionAmount;
    fee_amount?: TransactionAmount;
  };
};

type PayPalTransactionDetails = {
  transaction_info?: {
    transaction_id?: string;
    transaction_status?: string;
    transaction_initiation_date?: string;
    transaction_amount?: TransactionAmount;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: {
      given_name?: string;
      surname?: string;
      full_name?: string;
    };
  };
};

type PayPalSubscriptionTransactionsResponse = {
  transactions?: PayPalSubscriptionTransaction[];
  transaction_details?: PayPalTransactionDetails[];
};

export type PayPalReceipt = {
  id: string;
  status: string;
  time: string;
  amount: string;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
};

const formatName = (value?: { given_name?: string; surname?: string; full_name?: string }) => {
  if (!value) return null;
  if (value.full_name) return value.full_name;
  const parts = [value.given_name, value.surname].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
};

export const getSubscriptionReceipts = async ({
  subscriptionId,
  startTime,
  endTime,
}: {
  subscriptionId: string;
  startTime: string;
  endTime: string;
}) => {
  const data = await paypalGet<PayPalSubscriptionTransactionsResponse>(
    `/v1/billing/subscriptions/${subscriptionId}/transactions`,
    {
      start_time: startTime,
      end_time: endTime,
    }
  );

  const transactions = data.transactions ?? [];
  const mappedFromTransactions = transactions.map((tx) => {
    const amount = tx.amount_with_breakdown?.gross_amount;
    return {
      id: tx.id ?? "",
      status: tx.status ?? "UNKNOWN",
      time: tx.time ?? "",
      amount: amount?.value ?? "0.00",
      currency: amount?.currency_code ?? "USD",
      payerEmail: tx.payer_email ?? null,
      payerName: formatName(tx.payer_name),
    } as PayPalReceipt;
  });

  if (mappedFromTransactions.length) return mappedFromTransactions;

  const details = data.transaction_details ?? [];
  return details.map((tx) => {
    const info = tx.transaction_info;
    const amount = info?.transaction_amount;
    return {
      id: info?.transaction_id ?? "",
      status: info?.transaction_status ?? "UNKNOWN",
      time: info?.transaction_initiation_date ?? "",
      amount: amount?.value ?? "0.00",
      currency: amount?.currency_code ?? "USD",
      payerEmail: tx.payer_info?.email_address ?? null,
      payerName: formatName(tx.payer_info?.payer_name),
    } as PayPalReceipt;
  });
};
