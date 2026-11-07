/** How a task repeats: campaign tasks are one-off story steps, daily tasks reset every UTC day. */
export const TASK_KINDS = ["campaign", "daily"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_TITLES: Readonly<Record<TaskKind, string>> = {
  campaign: "Кампанія",
  daily: "Щоденні",
};
