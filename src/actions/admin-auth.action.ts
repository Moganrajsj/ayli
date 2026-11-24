"use server";

import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export interface AdminSignInResult {
  ok: boolean;
  message?: string;
}


export async function adminSignInAction(
  _prevState: AdminSignInResult | undefined,
  formData: FormData
): Promise<AdminSignInResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      ok: false,
      message: "Please enter both administrator email and password.",
    };
  }

  // Only explicitly provisioned ADMIN accounts may use the admin portal.
  // Never create or elevate an account as a side effect of a login attempt.
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, password: true },
    });
  } catch (error) {
    console.error("Admin sign-in database lookup failed:", error);
    return {
      ok: false,
      message: "Unable to sign in right now. Please try again later.",
    };
  }

  if (!user || user.role !== "ADMIN") {
    return {
      ok: false,
      message:
        "Access denied. This account does not possess administrator privileges.",
    };
  }

  if (!user.password) {
    return {
      ok: false,
      message: "Invalid administrator credentials.",
    };
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return {
      ok: false,
      message: "Invalid administrator credentials. Please try again.",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        message: "Authentication failed. Please verify your credentials.",
      };
    }
    // signIn throws Next.js redirect exception; rethrow it so Next.js redirects to /admin
    throw error;
  }

  return { ok: true };
}

export async function adminSignOutAction() {
  await signOut({ redirectTo: "/admin/login" });
}
