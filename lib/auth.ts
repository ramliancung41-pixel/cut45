export type AuthProfile = {
  email: string;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (!email) return "Enter an email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function authServiceMessage(message: string, mode: "create" | "sign-in") {
  if (/unexpected token|not valid json|<!doctype/i.test(message)) {
    return "Use your Supabase project URL, like https://your-project-ref.supabase.co.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "An account with that email already exists.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "Email or password does not match.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email, then sign in.";
  }
  return message || (mode === "create" ? "Could not create the account." : "Could not sign in.");
}

export function validatePassword(value: string) {
  if (!value) return "Enter a password.";
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) {
    return "Include a letter and a number.";
  }
  return null;
}
