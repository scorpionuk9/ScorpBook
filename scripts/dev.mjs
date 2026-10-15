// `npm run dev`: loads local HMRC sandbox credentials from .hmrc.dev.env (kept
// out of .env* files, which OpenNext bundles into the Worker), then starts Next.
import { existsSync } from "node:fs";

if (existsSync(".hmrc.dev.env")) process.loadEnvFile(".hmrc.dev.env");
process.argv = [process.argv[0], "next", "dev", ...process.argv.slice(2)];
await import("next/dist/bin/next");
