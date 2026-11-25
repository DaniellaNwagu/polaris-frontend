import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

type InputSize = 'default' | 'sm';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  size?: InputSize;
}

const sizeClasses: Record<InputSize, string> = {
  default: 'h-10',
  sm: 'h-9',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        sizeClasses[size],
        'w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]',
        'placeholder:text-[var(--faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
