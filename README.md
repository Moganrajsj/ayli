This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

> Note: the dev server runs locally on `PORT` 4000 (see `next.config.ts`), not 3000.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Secure admin account provisioning

Admin accounts are **not** created by the public admin login page. To create the first administrator, run the one-time CLI script from a trusted machine with the AYLI database connection configured:

```bash
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="use-a-unique-password-of-at-least-12-characters" npm run admin:create
```

Set `DATABASE_URL` in the same shell (or your local environment) before running the command. Do not commit credentials or paste them into source files.

If the email already belongs to a customer account, the script refuses to change its role by default. Only after verifying that you control that account, explicitly set `ADMIN_PROMOTE_EXISTING=true` and rerun; this promotes the account and sets the supplied password.

The script refuses to overwrite an account that is already an administrator. Run it only from a trusted environment and remove the temporary environment variables after use.
