'use client';

import { ASSET_STATES, type AssetState } from '@/lib/real-estate-api';

interface StatusProgressionTimelineProps {
  currentState: string;
  stateChangedAt?: string | null;
  stateChangeReason?: string | null;
  className?: string;
}

const ORDERED_STATES: AssetState[] = ['ACQUIRED', 'REGULARIZATION', 'RENOVATION', 'READY', 'SOLD', 'RENTED'];

function formatDate(iso: string | undefined | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return String(iso);
  }
}

export function StatusProgressionTimeline({
  currentState,
  stateChangedAt,
  stateChangeReason,
  className = '',
}: StatusProgressionTimelineProps) {
  const currentIndex = ORDERED_STATES.indexOf(currentState as AssetState);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 sm:gap-0 sm:flex-nowrap items-start">
        {ORDERED_STATES.map((state, index) => {
          const isReached = currentIndex >= 0 && index <= currentIndex;
          const isCurrent = state === currentState;
          const isLast = index === ORDERED_STATES.length - 1;

          return (
            <div key={state} className="flex items-center shrink-0">
              <div className="flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 ${
                    isCurrent
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : isReached
                        ? 'bg-green-100 border-green-500 text-green-800'
                        : 'bg-gray-100 border-gray-300 text-gray-500'
                  }`}
                  title={isCurrent && stateChangedAt ? `Since ${formatDate(stateChangedAt)}` : undefined}
                >
                  {index + 1}
                </div>
                <span
                  className={`mt-1 text-xs font-medium max-w-[4.5rem] text-center ${
                    isCurrent ? 'text-blue-600' : isReached ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  {state}
                </span>
                {isCurrent && stateChangedAt && (
                  <span className="mt-0.5 text-[10px] text-gray-500 text-center max-w-[5rem]">
                    {formatDate(stateChangedAt)}
                  </span>
                )}
                {isCurrent && stateChangeReason && (
                  <span className="mt-0.5 text-[10px] text-gray-600 text-center max-w-[6rem]" title={stateChangeReason}>
                    {stateChangeReason.slice(0, 20)}
                    {stateChangeReason.length > 20 ? '…' : ''}
                  </span>
                )}
              </div>
              {!isLast && (
                <div
                  className={`mx-0.5 w-4 sm:w-8 h-0.5 sm:h-0.5 self-[1.25rem] shrink-0 ${
                    isReached && index < currentIndex ? 'bg-green-400' : 'bg-gray-200'
                  }`}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
