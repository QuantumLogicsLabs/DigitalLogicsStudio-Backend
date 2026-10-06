/**
 * Idempotent seed script for the Problem collection.
 */

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const Problem = require("../src/models/Problem");
const problemsData = require("./seedData/problems.json");

async function seed() {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/digital-logics-studio";

  await mongoose.connect(mongoUri);
  console.log(`Connected to ${mongoose.connection.name}`);

  let created = 0;
  let updated = 0;
  const seenIds = new Set();

  for (const problem of problemsData) {
    if (seenIds.has(problem.id)) {
      throw new Error(`Duplicate id ${problem.id} in seedData/problems.json — aborting, fix the source file.`);
    }
    seenIds.add(problem.id);

    const result = await Problem.findOneAndUpdate(
      { id: problem.id },
      { $set: problem },
      { upsert: true, new: false, setDefaultsOnInsert: true },
    );
    if (result === null) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  const totalInDb = await Problem.countDocuments();

  console.log(`Seed complete: ${created} created, ${updated} updated, ${totalInDb} total in DB.`);
  if (totalInDb !== problemsData.length) {
    console.warn(
      `WARNING: DB has ${totalInDb} problems but seed source has ${problemsData.length}. ` +
        "There may be extra problems in the DB not present in problems.json (e.g. ones created " +
        "via the CRUD UI). That's expected once instructors start adding content directly.",
    );
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
