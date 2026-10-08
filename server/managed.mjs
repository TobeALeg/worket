import { createEnrollmentHandler } from "./enrollment.mjs";
import { join } from "node:path";
import { ProblemReportStore } from "./problem-reports.mjs";
import { ImprovementStore } from "./improvement.mjs";
import { AdminStore } from "./admin/store.mjs";
import { createAdminHandler, runtimeConfig } from "./admin/http.mjs";
import { createAIService } from "./service.mjs";
export function createManagedService({ directory, providerFactory, automaticEnrollment = false, globalDailyCalls = 200, trustProxy = false } = {}) {
  if (!directory) throw new Error("SERVER_DATA_DIR_REQUIRED");
  const store = new AdminStore(directory);
  const improvement = new ImprovementStore(join(directory, "improvement.sqlite"));
  const reports = new ProblemReportStore(join(directory, "problem-reports.sqlite"));
  let runtime;
  const adminHandler = createAdminHandler({
    store,
    improvement,
    reports,
    getRuntime: () => runtime,
    providerFactory,
  });
  runtime = createAIService({
    ...store.identity(),
    ...runtimeConfig(store, providerFactory),
    databasePath: join(directory, "metadata.sqlite"),
    adminHandler,
    enrollmentHandler: automaticEnrollment ? createEnrollmentHandler(store, { trustProxy }) : undefined,
    globalDailyCalls,
    improvement,
    reports,
    isAdminBusy: adminHandler.isTesting,
  });
  return { store, ...runtime };
}
