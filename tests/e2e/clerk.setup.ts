import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup("prepare Clerk testing token", async () => {
  await clerkSetup();
});
