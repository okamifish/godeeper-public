import "../src/env";

const { db } = await import("../src/db");
const { users, credits, creditTransactions, aiUsage } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const { checkAndIncrementAiUsage, completeAiUsage, releaseAiUsage } = await import("../src/middleware/membership");
const aiService = await import("../src/services/ai.service");

const USER_ID = "40000000-0000-4000-8000-000000000004";
const EMAIL = "hosted-verify@godeeper.local";

async function main() {
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({ id: USER_ID, email: EMAIL });
  await db.insert(credits).values({ userId: USER_ID, taskRun: 2 });

  const reservation = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
  console.log("reserve:", { allowed: reservation.allowed, reason: reservation.reason });

  if (!reservation.allowed) throw new Error("reservation should be allowed");

  let aiError = "";
  try {
    const result = await completeAiUsage(
      reservation.reservationId,
      () => aiService.runTask(USER_ID, "只回复 OK 两个字符，不要其它内容。", [], "deepseek-chat", (usage) => {
        console.log("usage:", usage);
      }),
    );
    console.log("ai result:", JSON.stringify(result).slice(0, 200));
  } catch (error) {
    aiError = error instanceof Error ? error.message : String(error);
    console.log("ai failed:", aiError.slice(0, 200));
  }

  const [creditRow] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
  const transactions = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
  console.log("credits after:", creditRow?.taskRun, "transactions:", transactions.map((row) => `${row.amount}:${row.reason}`));

  await db.update(credits).set({ taskRun: 0 }).where(eq(credits.userId, USER_ID));
  const exhausted = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
  console.log("exhausted:", { allowed: exhausted.allowed, reason: exhausted.reason });

  if (exhausted.reservationId) await releaseAiUsage(exhausted.reservationId);
  if (reservation.reservationId && aiError) await releaseAiUsage(reservation.reservationId);

  await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
  await db.delete(credits).where(eq(credits.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
}

await main();
process.exit(0);
