import { prisma } from "@/lib/prisma";
import { runRetentionPurge } from "@/lib/retention-purge";

if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

function numericArgument(name: string) {
  const prefix = `${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return value ? Number(value) : undefined;
}

runRetentionPurge({
  dryRun: process.argv.includes("--dry-run"),
  limit: numericArgument("--limit") ?? Number(process.env.RETENTION_PURGE_BATCH_SIZE ?? 25),
})
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
