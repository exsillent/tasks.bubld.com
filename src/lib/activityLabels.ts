import type { ActivityAction } from "@/lib/activity";

type ActivityEntry = {
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  taskNumber: number;
  taskTitle: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "the title",
  description: "the description",
  appAreaId: "the app area",
  priority: "priority",
  type: "type",
  dueDate: "the due date",
  quotedHours: "quoted hours",
};

/** Plain-English description of one activity entry, e.g. "changed priority on #45: Fix login bug". */
export function describeActivity(entry: ActivityEntry): string {
  // Task number + title together, everywhere -- so an entry is identifiable
  // without having to open the task.
  const ref = `#${entry.taskNumber}: ${entry.taskTitle}`;
  switch (entry.action as ActivityAction) {
    case "created":
      return `created ${ref}`;
    case "edited":
      return `changed ${FIELD_LABELS[entry.field ?? ""] ?? entry.field} on ${ref}`;
    case "assigned":
      return `assigned ${ref} to ${entry.newValue}`;
    case "unassigned":
      return `unassigned ${ref}${entry.oldValue ? ` (was ${entry.oldValue})` : ""}`;
    case "moved":
      return `moved ${ref} to ${entry.newValue}`;
    case "approved":
      return `approved ${ref}`;
    case "sent_back":
      return `sent ${ref} back for changes`;
    case "deployed":
      return `marked ${ref} deployed`;
    case "archived":
      return `archived ${ref}`;
    case "unarchived":
      return `brought ${ref} back`;
    case "stage_changed":
      return `moved ${ref} to ${entry.newValue}`;
    case "stage_status_changed":
      return `set ${ref} to ${entry.newValue}`;
    case "closed":
      return `closed ${ref}`;
    case "reopened":
      return `reopened ${ref}`;
    case "deleted":
      return `deleted ${ref}`;
    case "published":
      return `published ${ref}`;
    case "commented":
      return `commented on ${ref}`;
    case "quote_updated":
      return `updated the quote on ${ref}`;
    case "build_tagged":
      return `added ${ref} to the next build`;
    case "build_untagged":
      return `removed ${ref} from the next build`;
    default:
      return `updated ${ref}`;
  }
}
