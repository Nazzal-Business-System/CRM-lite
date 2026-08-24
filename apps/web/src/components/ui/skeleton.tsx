import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/80 after:absolute after:inset-0 after:animate-[nbs-skeleton_1.35s_ease-in-out_infinite] after:bg-linear-to-r after:from-transparent after:via-background/50 after:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
