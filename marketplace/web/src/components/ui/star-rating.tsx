'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  score: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({
  score,
  max = 5,
  size = 'md',
  showValue = false,
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const stars = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {stars.map((star) => (
        <button
          key={star}
          type={interactive ? 'button' : undefined}
          className={cn(
            'relative flex items-center justify-center transition-colors',
            {
              'cursor-pointer': interactive,
              'pointer-events-none': !interactive,
            }
          )}
          onClick={() => interactive && onChange?.(star)}
        >
          <Star
            className={cn(
              'transition-colors duration-200',
              sizeClasses[size],
              star <= Math.floor(score)
                ? 'text-amber-400 fill-current'
                : star <= score
                ? 'text-amber-400/50 fill-current'
                : 'text-muted-foreground/30'
            )}
            fill={star <= score ? 'currentColor' : 'none'}
            strokeWidth={star <= score ? 0 : 1.5}
          />
        </button>
      ))}
      {showValue && (
        <span className="ml-1 text-sm font-medium text-foreground">
          {score.toFixed(1)}
        </span>
      )}
    </div>
  );
}
