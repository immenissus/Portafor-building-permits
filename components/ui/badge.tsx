import { cn, filingLabel } from "@/lib/utils";

export function FilingBadge({ type }: { type: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", type === "business_license" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800")}>
      {filingLabel(type)}
    </span>
  );
}
