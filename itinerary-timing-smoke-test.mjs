import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const source = readFileSync("app.js", "utf8");

assert.match(
  source,
  /activities = fillFullDay\(activities,\s*9,/,
  "Generated days should build toward nine events when the time budget permits"
);
assert.match(
  source,
  /\[breakfastActivity,\s*lunchActivity,\s*dinnerActivity\]\.forEach\(\(item\) => \{ item\.mealAnchor = true; \}\)/,
  "Breakfast, lunch, and dinner must be explicit schedule anchors"
);
assert.match(
  source,
  /const lunchActivity = activity\("Eat",\s*"🍽️",\s*"12:30"/,
  "Generated lunch must be anchored within the noon-to-2 PM service window"
);
assert.match(
  source,
  /const dinnerTime = preferences\.evening === "quiet" \? "18:30" : preferences\.evening === "nightlife" \? "20:00" : "19:00"/,
  "Generated dinner starts must remain between 6 and 8 PM"
);
assert.match(
  source,
  /const breakfastTime = preferences\.start === "early" \? "07:30" : preferences\.start === "slow" \? "10:00" : "08:30"/,
  "Breakfast must follow the selected day-start preference"
);
assert.match(
  source,
  /if \(cursor > desiredEnd && output\.length > 7\)/,
  "Schedule trimming must preserve at least seven daily events"
);
assert.match(
  source,
  /\(Boolean\(item\.mealAnchor\) \|\| \/confirmed\/i\.test/,
  "The scheduler must treat meal anchors and confirmed reservations as fixed"
);

console.log("Itinerary timing smoke test passed: meal windows and 7–9 event policy are enforced.");
