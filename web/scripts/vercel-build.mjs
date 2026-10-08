// Build na Vercel. As migrations são aplicadas pelo Supabase (supabase db push), nunca pelo Prisma.
import { execSync } from "node:child_process";
const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};
run("prisma generate");
run("next build");
