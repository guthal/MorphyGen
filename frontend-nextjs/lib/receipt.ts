type ReceiptParty = {
  name?: string | null;
  email?: string | null;
  address?: string | null;
  vatNumber?: string | null;
};

export type ReceiptLine = {
  description: string;
  amount: string;
  currency: string;
};

export type ReceiptData = {
  id: string;
  issuedAt: string;
  status: string;
  merchantName: string;
  customer: ReceiptParty;
  line: ReceiptLine;
  subtotal: string;
  total: string;
  currency: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
};

export const buildReceiptHtml = (receipt: ReceiptData) => {
  const customerName = receipt.customer.name
    ? escapeHtml(receipt.customer.name)
    : "Customer";
  const customerEmail = receipt.customer.email
    ? escapeHtml(receipt.customer.email)
    : "";
  const customerAddress = receipt.customer.address
    ? escapeHtml(receipt.customer.address)
    : "";
  const customerVat = receipt.customer.vatNumber
    ? escapeHtml(receipt.customer.vatNumber)
    : "";

  const lineDescription = escapeHtml(receipt.line.description);
  const lineAmount = escapeHtml(receipt.line.amount);
  const lineCurrency = escapeHtml(receipt.line.currency);
  const issuedAt = escapeHtml(formatDate(receipt.issuedAt));
  const status = escapeHtml(receipt.status);
  const receiptId = escapeHtml(receipt.id);
  const merchantName = escapeHtml(receipt.merchantName);
  const total = escapeHtml(receipt.total);
  const subtotal = escapeHtml(receipt.subtotal);
  const totalCurrency = escapeHtml(receipt.currency);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Receipt ${receiptId}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        font-family: "Source Serif 4", Georgia, serif;
        margin: 0;
        padding: 48px;
        background: #f8f5f0;
        color: #1d1a17;
      }
      .sheet {
        background: #ffffff;
        border: 1px solid #e7e1d8;
        border-radius: 16px;
        padding: 40px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
      }
      .brand {
        font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .meta {
        text-align: right;
        font-size: 14px;
        color: #5b5248;
      }
      .meta strong {
        color: #1d1a17;
      }
      .section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        margin-bottom: 24px;
      }
      .label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8b8074;
        margin-bottom: 8px;
      }
      .value {
        font-size: 14px;
        line-height: 1.6;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 24px;
      }
      th,
      td {
        text-align: left;
        padding: 12px 0;
        border-bottom: 1px solid #efe9e0;
        font-size: 14px;
      }
      th {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8b8074;
      }
      .totals {
        margin-top: 24px;
        display: flex;
        justify-content: flex-end;
      }
      .totals table {
        width: 300px;
      }
      .totals td {
        border: none;
        padding: 6px 0;
      }
      .totals tr:last-child td {
        font-weight: 700;
        font-size: 16px;
      }
      .footer {
        margin-top: 32px;
        font-size: 12px;
        color: #8b8074;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <div class="brand">${merchantName}</div>
          <div style="margin-top: 6px; font-size: 13px; color: #6d6358;">
            Receipt for subscription payment
          </div>
        </div>
        <div class="meta">
          <div><strong>Receipt</strong> ${receiptId}</div>
          <div>${issuedAt}</div>
          <div>Status: ${status}</div>
        </div>
      </div>

      <div class="section">
        <div>
          <div class="label">Billed To</div>
          <div class="value">
            ${customerName}<br />
            ${customerEmail ? `${customerEmail}<br />` : ""}
            ${customerAddress ? `${customerAddress}<br />` : ""}
            ${customerVat ? `VAT: ${customerVat}` : ""}
          </div>
        </div>
        <div>
          <div class="label">Summary</div>
          <div class="value">
            Plan: ${lineDescription}<br />
            Amount: ${lineCurrency} ${lineAmount}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${lineDescription}</td>
            <td>${lineCurrency} ${lineAmount}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>${totalCurrency} ${subtotal}</td>
            </tr>
            <tr>
              <td>Total</td>
              <td>${totalCurrency} ${total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        This receipt was generated from your PayPal subscription transaction.
      </div>
    </div>
  </body>
</html>`;
};
