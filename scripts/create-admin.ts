import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "AYLI Administrator";
  const promoteExisting = process.env.ADMIN_PROMOTE_EXISTING === "true";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to a valid email address.");
  }
  if (password.length < 12) {
    throw new Error("Set ADMIN_PASSWORD to a password with at least 12 characters.");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing?.role === "ADMIN") {
    throw new Error("This account is already an administrator. No changes were made.");
  }

  const passwordHash = await hashPassword(password);

  if (existing) {
    if (!promoteExisting) {
      throw new Error(
        "An account with this email already exists as a customer. " +
        "To explicitly promote this account, set ADMIN_PROMOTE_EXISTING=true and rerun."
      );
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", password: passwordHash },
    });
    console.log("Existing account promoted to AYLI administrator.");
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: "ADMIN",
      password: passwordHash,
    },
  });
  console.log("AYLI administrator account created.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Admin provisioning failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
