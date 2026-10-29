import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary-soft text-primary',
      neutral: 'border-transparent bg-muted text-muted-foreground',
      success: 'border-transparent bg-success-soft text-success',
      warning: 'border-transparent bg-warning-soft text-warning',
      danger: 'border-transparent bg-destructive-soft text-destructive',
      info: 'border-transparent bg-info-soft text-info',
      outline: 'border-border text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const statusVariant: Record<string, BadgeVariant> = {
  active: 'success', paid: 'success', accepted: 'success', signed: 'success', completed: 'success', present: 'success', connected: 'success', done: 'success', available: 'success', enrolled: 'success', sent: 'info', delivered: 'success', read: 'success', finalized: 'success',
  pending: 'warning', partial: 'warning', paused: 'warning', trial: 'info', in_progress: 'info', scheduled: 'info', confirmed: 'default', queued: 'neutral', draft: 'neutral', open: 'info', maintenance: 'warning', config_required: 'warning', negotiation: 'warning',
  overdue: 'danger', cancelled: 'neutral', refunded: 'neutral', failed: 'danger', error: 'danger', absent: 'danger', lost: 'neutral', inactive: 'neutral', expired: 'neutral', not_connected: 'neutral', urgent: 'danger', high: 'warning', rejected: 'neutral',
};
