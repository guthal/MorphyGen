import { supabaseAdmin } from "@/lib/supabaseAdmin";

const toUtcDateString = (date: Date) => date.toISOString().slice(0, 10);

export const recordApiUsage = async (apiKey: string, userId: string) => {
  if (!apiKey || !userId) return;

  const now = new Date();
  const usageDate = toUtcDateString(now);

  try {
    await supabaseAdmin.rpc("increment_api_key_usage", {
      p_api_key: apiKey,
      p_user_id: userId,
      p_usage_date: usageDate,
    });
  } catch (error) {
    console.error("Failed to increment API usage", error);
  }

  try {
    await supabaseAdmin
      .from("api_keys")
      .update({ last_used_at: now.toISOString() })
      .eq("key", apiKey)
      .eq("user_id", userId);
  } catch (error) {
    console.error("Failed to update API key last_used_at", error);
  }
};
