import { cn } from "@/lib/utils";

/**
 * Select natif stylé (pas Radix) : les formulaires ZARYA soumettent en FormData
 * vers des Server Actions — le natif reste le plus fiable et accessible.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "block h-9 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
