import { memo } from 'react';
import { useNow } from '../hooks/useNow';
import { formatAge, formatTime } from '../utils/helpers';
import { ClockIcon } from './Icons';

/** Warns that the numbers on screen are no longer live, so old data is never mistaken for current. */
function StaleBannerImpl({ lastEventAt }: { lastEventAt: number }) {
  const now = useNow(true, 1_000);

  return (
    <div className="stale-banner" role="status">
      <ClockIcon />
      <span>
        <strong>Live updates interrupted.</strong> Showing data from {formatTime(lastEventAt)}{' '}
        <span aria-hidden="true">({formatAge(now - lastEventAt)} ago)</span>. Values may be out of date.
      </span>
    </div>
  );
}

export const StaleBanner = memo(StaleBannerImpl);
