import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-white hover:opacity-90",
        primary:
          "bg-[var(--accent)] text-white hover:opacity-90",
        secondary:
          "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]",
        outline:
          "border border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]",
        ghost: "bg-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]",
        yes:
          "bg-[var(--yes)] text-white hover:opacity-90",
        no:
          "bg-[var(--no)] text-white hover:opacity-90",
        destructive:
          "bg-[var(--no)] text-white hover:opacity-90",
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        // 44px touch target for mobile embeds (WCAG 2.5.8 / platform guidance).
        touch: 'h-11 px-4 text-sm',
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
