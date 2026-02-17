"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const defaultProduct = {
  name: "MorphyGen Credits",
  description: "HTML to PDF subscription and more...",
  type: "SERVICE" as const,
  category: "SOFTWARE",
};

const defaultPlan = {
  productId: "",
  name: "MorphyGen Pro Monthly",
  description: "Monthly subscription",
  price: "29.00",
  currency: "USD",
  intervalUnit: "MONTH" as const,
  intervalCount: 1,
};

export default function PayPalAdminPage() {
  const [productForm, setProductForm] = useState(defaultProduct);
  const [planForm, setPlanForm] = useState(defaultPlan);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [productLookupId, setProductLookupId] = useState("");
  const [planLookupId, setPlanLookupId] = useState("");
  const [productInfo, setProductInfo] = useState<Record<string, unknown> | null>(null);
  const [planInfo, setPlanInfo] = useState<Record<string, unknown> | null>(null);
  const [productsList, setProductsList] = useState<Record<string, unknown> | null>(null);
  const [plansList, setPlansList] = useState<Record<string, unknown> | null>(null);
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [fetchingPlan, setFetchingPlan] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [fetchingPlans, setFetchingPlans] = useState(false);
  const products =
    productsList && Array.isArray((productsList as { products?: unknown }).products)
      ? ((productsList as { products: Record<string, unknown>[] }).products ?? [])
      : [];
  const plans =
    plansList && Array.isArray((plansList as { plans?: unknown }).plans)
      ? ((plansList as { plans: Record<string, unknown>[] }).plans ?? [])
      : [];

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setNotice("Copied to clipboard.");
  };

  const getAuthHeaders = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const handleCreateProduct = async () => {
    setNotice(null);
    setError(null);
    setCreatingProduct(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setCreatingProduct(false);
      return;
    }

    const response = await fetch("/api/paypal/product", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(productForm),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Failed to create product.");
      setCreatingProduct(false);
      return;
    }

    setProductId(body.product?.id || null);
    setPlanForm((prev) => ({ ...prev, productId: body.product?.id || prev.productId }));
    setNotice(`Created product ${body.product?.id}`);
    setCreatingProduct(false);
  };

  const handleCreatePlan = async () => {
    setNotice(null);
    setError(null);
    setCreatingPlan(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setCreatingPlan(false);
      return;
    }

    const response = await fetch("/api/paypal/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(planForm),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Failed to create plan.");
      setCreatingPlan(false);
      return;
    }

    setPlanId(body.plan?.id || null);
    setNotice(`Created plan ${body.plan?.id}`);
    setCreatingPlan(false);
  };

  const handleFetchProduct = async () => {
    setNotice(null);
    setError(null);
    setFetchingProduct(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setFetchingProduct(false);
      return;
    }

    const response = await fetch(
      `/api/paypal/product?id=${encodeURIComponent(productLookupId.trim())}`,
      { headers }
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error || "Failed to load product.");
      setFetchingProduct(false);
      return;
    }

    setProductInfo(body.product || null);
    setFetchingProduct(false);
  };

  const handleFetchPlan = async () => {
    setNotice(null);
    setError(null);
    setFetchingPlan(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setFetchingPlan(false);
      return;
    }

    const response = await fetch(
      `/api/paypal/plan?id=${encodeURIComponent(planLookupId.trim())}`,
      { headers }
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error || "Failed to load plan.");
      setFetchingPlan(false);
      return;
    }

    setPlanInfo(body.plan || null);
    setFetchingPlan(false);
  };

  const handleFetchProducts = async () => {
    setNotice(null);
    setError(null);
    setFetchingProducts(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setFetchingProducts(false);
      return;
    }

    const response = await fetch("/api/paypal/products", { headers });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error || "Failed to load products.");
      setFetchingProducts(false);
      return;
    }

    setProductsList(body.products || null);
    setFetchingProducts(false);
  };

  const handleFetchPlans = async () => {
    setNotice(null);
    setError(null);
    setFetchingPlans(true);

    const headers = await getAuthHeaders();
    if (!headers) {
      setError("No active session found.");
      setFetchingPlans(false);
      return;
    }

    const response = await fetch(
      `/api/paypal/plans?product_id=${encodeURIComponent(planForm.productId || "")}`,
      { headers }
    );
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error || "Failed to load plans.");
      setFetchingPlans(false);
      return;
    }

    setPlansList(body.plans || null);
    setFetchingPlans(false);
  };

  const renderProductCard = (product: Record<string, unknown>) => {
    const id = String(product.id || "");
    const name = String(product.name || "Unnamed product");
    const description = String(product.description || "");
    const category = String(product.category || "—");
    const type = String(product.type || "—");
    const createdAt = product.create_time ? new Date(String(product.create_time)) : null;

    return (
      <article key={id} className="admin-card">
        <div className="admin-card-header">
          <div>
            <h4>{name}</h4>
            <p className="admin-subtitle">{description || "No description."}</p>
          </div>
          <button className="button" type="button" onClick={() => handleCopy(id)}>
            Copy ID
          </button>
        </div>
        <div className="admin-pill-row">
          <span className="admin-pill">{type}</span>
          <span className="admin-pill">{category}</span>
        </div>
        <div className="admin-meta">
          <span>ID: {id}</span>
          <span>{createdAt ? createdAt.toDateString() : "Date unknown"}</span>
        </div>
      </article>
    );
  };

  const renderPlanCard = (plan: Record<string, unknown>) => {
    const id = String(plan.id || "");
    const name = String(plan.name || "Unnamed plan");
    const description = String(plan.description || "");
    const status = String(plan.status || "UNKNOWN");
    const productId = String(plan.product_id || "");
    const billingCycles = Array.isArray(plan.billing_cycles) ? plan.billing_cycles : [];
    const primaryCycle = billingCycles[0] as Record<string, unknown> | undefined;
    const pricingScheme = (primaryCycle?.pricing_scheme || {}) as Record<string, unknown>;
    const fixedPrice = (pricingScheme.fixed_price || {}) as Record<string, unknown>;
    const priceValue = fixedPrice.value ? String(fixedPrice.value) : "—";
    const priceCurrency = fixedPrice.currency_code ? String(fixedPrice.currency_code) : "";
    const frequency = (primaryCycle?.frequency || {}) as Record<string, unknown>;
    const intervalUnit = frequency.interval_unit ? String(frequency.interval_unit) : "—";
    const intervalCount = frequency.interval_count ? String(frequency.interval_count) : "1";

    return (
      <article key={id} className="admin-card">
        <div className="admin-card-header">
          <div>
            <h4>{name}</h4>
            <p className="admin-subtitle">{description || "No description."}</p>
          </div>
          <button className="button" type="button" onClick={() => handleCopy(id)}>
            Copy ID
          </button>
        </div>
        <div className="admin-pill-row">
          <span className="admin-pill">{status}</span>
          <span className="admin-pill">
            {priceValue} {priceCurrency}
          </span>
          <span className="admin-pill">
            Every {intervalCount} {intervalUnit}
          </span>
        </div>
        <div className="admin-meta">
          <span>ID: {id}</span>
          <span>Product: {productId || "—"}</span>
        </div>
      </article>
    );
  };

  return (
    <section className="section">
      <h2>PayPal Admin</h2>
      <p>Create products and plans with a single click for subscriptions.</p>
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="notice">{error}</p> : null}

      <div className="settings-stack">
        <div className="settings-card">
          <h3>Create Product</h3>
          <div className="settings-grid">
            <div className="settings-field">
              <label htmlFor="productName">Name</label>
              <input
                id="productName"
                type="text"
                value={productForm.name}
                onChange={(event) =>
                  setProductForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="productDescription">Description</label>
              <input
                id="productDescription"
                type="text"
                value={productForm.description}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="productCategory">Category</label>
              <input
                id="productCategory"
                type="text"
                value={productForm.category}
                onChange={(event) =>
                  setProductForm((prev) => ({
                    ...prev,
                    category: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="settings-actions">
            <button
              className="button primary"
              type="button"
              disabled={creatingProduct}
              onClick={handleCreateProduct}
            >
              {creatingProduct ? "Creating..." : "Create product"}
            </button>
            {productId ? (
              <>
                <span>Product ID: {productId}</span>
                <button
                  className="button"
                  type="button"
                  onClick={() => handleCopy(productId)}
                >
                  Copy ID
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="settings-card">
          <h3>Create Plan</h3>
          <div className="settings-grid">
            <div className="settings-field">
              <label htmlFor="planProductId">Product ID</label>
              {products.length ? (
                <select
                  id="planProductId"
                  value={planForm.productId}
                  onChange={(event) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      productId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={String(product.id)} value={String(product.id)}>
                      {String(product.name || product.id)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="planProductId"
                  type="text"
                  value={planForm.productId}
                  onChange={(event) =>
                    setPlanForm((prev) => ({
                      ...prev,
                      productId: event.target.value,
                    }))
                  }
                />
              )}
            </div>
            <div className="settings-field">
              <label htmlFor="planName">Plan name</label>
              <input
                id="planName"
                type="text"
                value={planForm.name}
                onChange={(event) =>
                  setPlanForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="planDescription">Description</label>
              <input
                id="planDescription"
                type="text"
                value={planForm.description}
                onChange={(event) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="planPrice">Price</label>
              <input
                id="planPrice"
                type="text"
                value={planForm.price}
                onChange={(event) =>
                  setPlanForm((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="planCurrency">Currency</label>
              <input
                id="planCurrency"
                type="text"
                value={planForm.currency}
                onChange={(event) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="intervalUnit">Interval unit</label>
              <input
                id="intervalUnit"
                type="text"
                value={planForm.intervalUnit}
                onChange={(event) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    intervalUnit: event.target.value.toUpperCase() as
                      | "DAY"
                      | "WEEK"
                      | "MONTH"
                      | "YEAR",
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="intervalCount">Interval count</label>
              <input
                id="intervalCount"
                type="number"
                value={planForm.intervalCount}
                onChange={(event) =>
                  setPlanForm((prev) => ({
                    ...prev,
                    intervalCount: Number(event.target.value || 1),
                  }))
                }
              />
            </div>
          </div>
          <div className="settings-actions">
            <button
              className="button primary"
              type="button"
              disabled={creatingPlan}
              onClick={handleCreatePlan}
            >
              {creatingPlan ? "Creating..." : "Create plan"}
            </button>
            <button
              className="button"
              type="button"
              onClick={handleFetchProducts}
              disabled={fetchingProducts}
            >
              {fetchingProducts ? "Loading products..." : "Load products"}
            </button>
            {planId ? (
              <>
                <span>Plan ID: {planId}</span>
                <button
                  className="button"
                  type="button"
                  onClick={() => handleCopy(planId)}
                >
                  Copy ID
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="settings-card">
          <h3>Lookup</h3>
          <div className="settings-grid">
            <div className="settings-field">
              <label htmlFor="lookupProduct">Product ID</label>
              <input
                id="lookupProduct"
                type="text"
                value={productLookupId}
                onChange={(event) => setProductLookupId(event.target.value)}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="lookupPlan">Plan ID</label>
              <input
                id="lookupPlan"
                type="text"
                value={planLookupId}
                onChange={(event) => setPlanLookupId(event.target.value)}
              />
            </div>
          </div>
          <div className="settings-actions">
            <button
              className="button"
              type="button"
              onClick={handleFetchProduct}
              disabled={fetchingProduct || !productLookupId.trim()}
            >
              {fetchingProduct ? "Loading..." : "Fetch product"}
            </button>
            <button
              className="button"
              type="button"
              onClick={handleFetchPlan}
              disabled={fetchingPlan || !planLookupId.trim()}
            >
              {fetchingPlan ? "Loading..." : "Fetch plan"}
            </button>
          </div>
          {productInfo ? (
            <pre className="settings-code">{JSON.stringify(productInfo, null, 2)}</pre>
          ) : null}
          {planInfo ? (
            <pre className="settings-code">{JSON.stringify(planInfo, null, 2)}</pre>
          ) : null}
        </div>

        <div className="settings-card">
          <h3>List</h3>
          <p>Fetch recent products and plans from PayPal.</p>
          <div className="settings-actions">
            <button
              className="button"
              type="button"
              onClick={handleFetchProducts}
              disabled={fetchingProducts}
            >
              {fetchingProducts ? "Loading..." : "Load products"}
            </button>
            <button
              className="button"
              type="button"
              onClick={handleFetchPlans}
              disabled={fetchingPlans}
            >
              {fetchingPlans ? "Loading..." : "Load plans"}
            </button>
          </div>
          {products.length ? (
            <div className="admin-card-grid">
              {products.map((product) => renderProductCard(product))}
            </div>
          ) : null}
          {plans.length ? (
            <div className="admin-card-grid">
              {plans.map((plan) => renderPlanCard(plan))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
