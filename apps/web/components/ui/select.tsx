import { cn } from "@/lib/utils";

/**
 * Select natif stylé (pas Radix) : les formulaires ZARYA soumettent en FormData
 * vers des Server Actions — le natif reste le plus fiable et accessible.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "block h-8 w-full rounded-md border border-input bg-card px-2.5 py-1 text-[13px] text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
