/**
 * Demo adapter — provides fixture data via the same interface as real server functions.
 *
 * Use in /demo route instead of live server function calls.
 * The UI components receive the same typed data either way.
 */
import {
  DEMO_TENANT,
  DEMO_GOAL,
  DEMO_BOARD_ITEMS,
  DEMO_PAGES,
  DEMO_LEADS,
  DEMO_CLIENT_HEALTH,
  DEMO_ACTION_QUEUE,
  DEMO_REPORT,
} from "./fixtures";

export const demoAdapter = {
  listMyTenants: () => ({ tenants: [DEMO_TENANT] }),

  getActiveGrowthGoal: () => ({ goal: DEMO_GOAL }),

  getExecutionBoard: () => ({
    plan: { id: "demo-plan-1", status: "active" },
    items: DEMO_BOARD_ITEMS,
    summary: {
      total: DEMO_BOARD_ITEMS.length,
      planned: DEMO_BOARD_ITEMS.filter((i) => i.executionStatus === "planned").length,
      in_qa: DEMO_BOARD_ITEMS.filter((i) => i.executionStatus === "in_qa").length,
      needs_edit: 0,
      approved: DEMO_BOARD_ITEMS.filter((i) => i.executionStatus === "approved").length,
      manual_task: 0,
      blocked: 0,
      done: DEMO_BOARD_ITEMS.filter((i) => i.executionStatus === "done").length,
    },
    nextAction: "Review page brief: Boiler Installation Dallas",
  }),

  getPageInventory: () => ({ pages: DEMO_PAGES }),

  listLeads: () => ({ leads: DEMO_LEADS }),

  getLeadStats: () => ({
    stats: {
      total: DEMO_LEADS.length,
      byStatus: {
        new: DEMO_LEADS.filter((l) => l.status === "new").length,
        qualified: DEMO_LEADS.filter((l) => l.status === "qualified").length,
        won: DEMO_LEADS.filter((l) => l.status === "won").length,
        lost: DEMO_LEADS.filter((l) => l.status === "lost").length,
        junk: 0,
      },
      last30Days: DEMO_LEADS.length,
      last7Days: 3,
      firstSeen: DEMO_LEADS[DEMO_LEADS.length - 1]?.createdAt ?? null,
      lastSeen: DEMO_LEADS[0]?.createdAt ?? null,
    },
  }),

  getClientHealthSummaries: () => ({ summaries: [DEMO_CLIENT_HEALTH] }),

  getOperatorActionQueue: () => ({ items: DEMO_ACTION_QUEUE }),

  getMonthlyReportSummary: () => DEMO_REPORT,
} as const;

export type DemoAdapter = typeof demoAdapter;
