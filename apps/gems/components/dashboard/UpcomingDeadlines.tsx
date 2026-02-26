'use client';

interface DeadlineItem {
  id: string;
  title: string;
  due_date: string;
  days_until_due: number;
  resource_type: string;
}

interface UpcomingDeadlinesProps {
  total: number;
  overdueCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  critical: DeadlineItem[];
  error?: boolean;
}

export function UpcomingDeadlines({
  total,
  overdueCount,
  dueTodayCount,
  dueThisWeekCount,
  critical,
  error,
}: UpcomingDeadlinesProps) {
  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-500">Upcoming deadlines</p>
        <p className="mt-1 text-red-600">Unable to load</p>
      </div>
    );
  }

  const summary = [
    overdueCount > 0 && `${overdueCount} overdue`,
    dueTodayCount > 0 && `${dueTodayCount} due today`,
    dueThisWeekCount > 0 && `${dueThisWeekCount} due this week`,
  ]
    .filter(Boolean)
    .join(' · ') || 'None';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-500">Upcoming deadlines</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{total}</p>
      <p className="mt-1 text-sm text-gray-600">{summary}</p>
      {critical.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {critical.slice(0, 5).map((d) => (
            <li key={d.id} className="text-sm text-gray-700">
              <span className="font-medium">{d.title}</span>
              <span className="text-gray-500">
                {' '}
                — {d.days_until_due < 0 ? 'Overdue' : `in ${d.days_until_due}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
