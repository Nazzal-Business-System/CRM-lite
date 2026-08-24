"use client";

import { PERMISSION_KEYS } from "@nbs/shared";
import { PermissionGate } from "@/components/permission-gate";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export default function TasksPage() {
  return (
    <PermissionGate permission={PERMISSION_KEYS.TASKS_VIEW}>
      <TasksWorkspace />
    </PermissionGate>
  );
}
