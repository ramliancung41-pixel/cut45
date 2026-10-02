function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function present(word: string) {
  if (word !== word.toLowerCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function firstWord(value: string) {
  const word = value.split(/\s+/).find(Boolean) ?? "";
  if (!word || word.includes("@")) return "";
  return present(word);
}

function fromEmailHandle(email: string) {
  const local = email.split("@")[0]?.trim() ?? "";
  const words = local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !word.includes("@"));
  if (words.length === 0) return "Account";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function accountDisplayName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null },
  profileLabel?: string | null,
) {
  const meta = user.user_metadata ?? {};
  const named = [profileLabel, meta.first_name, meta.given_name, meta.full_name, meta.name, meta.display_name]
    .map((value) => firstWord(text(value)))
    .find(Boolean);
  if (named) return named;
  return fromEmailHandle(text(user.email));
}
