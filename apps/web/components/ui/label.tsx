import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: l'association se fait via htmlFor/children à l'usage
    <label
      className={cn("block text-sm font-medium text-secondary-foreground", className)}
      {...props}
    />
  );
}

export { Label };
