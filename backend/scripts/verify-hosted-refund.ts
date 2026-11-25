import "../src/env";

const { db } = await import("../src/db");
const { users, credits, creditTransactions, aiUsage } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const { checkAndIncrementAiUsage, completeAiUsage } = await import("../src/middleware/membership");
const aiService = await import("../src/services/ai.service");

const USER_ID = "40000000-0000-4000-8000-000000000005";
const EMAIL = "hosted-refund@godeeper.local";

async function main() {
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({ id: USER_ID, email: EMAIL });
  await db.insert(credits).values({ userId: USER_ID, taskRun: 1 });

  const reservation = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
  console.log("reserve:", reservation.allowed);

  let failed = false;
  try {
    await completeAiUsage(reservation.reservationId, () =>
      aiService.runTask(USER_ID, "test", [], "invalid-model-name-for-refund", undefined));
  } catch (error) {
    failed = true;
    console.log("ai failed as expected:", error instanceof Error ? error.message.slice(0, 120) : String(error));
  }

  const [creditRow] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
  const transactions = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
  console.log("failed:", failed, "credits after:", creditRow?.taskRun, "transactions:", transactions.map((row) => `${row.amount}:${row.reason}`));

  await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
  await db.delete(credits).where(eq(credits.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
}

await main();
process.exit(0);
