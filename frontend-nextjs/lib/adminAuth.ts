const parseEmailList = (value: string | undefined) =>
  (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const getAdminEmails = () => {
  const primary = parseEmailList(process.env.PAYPAL_ADMIN_EMAILS);
  if (primary.length > 0) return primary;

  const publicList = parseEmailList(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  if (publicList.length > 0) return publicList;

  return parseEmailList(process.env.NEXT_PUBLIC_ADMIN_EMAIL);
};

export const isAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.toLowerCase());
};
