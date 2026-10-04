'use client';

export interface ReviewFiltersProps {
  readonly selectedRating?: number | null;
  readonly onSelectRating: (rating: number | null) => void;
  readonly withMedia: boolean;
  readonly onToggleWithMedia: (withMedia: boolean) => void;
  readonly verifiedOnly: boolean;
  readonly onToggleVerifiedOnly: (verifiedOnly: boolean) => void;
  readonly sort: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS';
  readonly onSelectSort: (sort: 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS') => void;
  readonly totalMatching?: number;
  readonly onResetFilters: () => void;
}

export function ReviewFilters({
  selectedRating,
  onSelectRating,
  withMedia,
  onToggleWithMedia,
  verifiedOnly,
  onToggleVerifiedOnly,
  sort,
  onSelectSort,
  totalMatching,
  onResetFilters,
}: ReviewFiltersProps) {
  const hasActiveFilters = Boolean(selectedRating || withMedia || verifiedOnly);

  return (
    <div className="review-filters-bar" aria-label="Review filters and sorting">
      {/* Horizontal filter chips */}
      <div className="filter-chips-scroll">
        <button
          type="button"
          className={`filter-chip ${!selectedRating && !withMedia && !verifiedOnly ? 'is-active' : ''}`}
          onClick={onResetFilters}
        >
          All Reviews
        </button>

        {[5, 4, 3, 2, 1].map((rating) => {
          const isActive = selectedRating === rating;
          return (
            <button
              type="button"
              key={rating}
              className={`filter-chip ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelectRating(isActive ? null : rating)}
              aria-pressed={isActive}
            >
              <span>{rating}★</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`filter-chip ${withMedia ? 'is-active' : ''}`}
          onClick={() => onToggleWithMedia(!withMedia)}
          aria-pressed={withMedia}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>With Media</span>
        </button>

        <button
          type="button"
          className={`filter-chip ${verifiedOnly ? 'is-active' : ''}`}
          onClick={() => onToggleVerifiedOnly(!verifiedOnly)}
          aria-pressed={verifiedOnly}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Verified Buyer</span>
        </button>

        {hasActiveFilters ? (
          <button
            type="button"
            className="filter-reset-link"
            onClick={onResetFilters}
            aria-label="Clear all applied review filters"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Sort Selector & Count */}
      <div className="filters-sort-group">
        {totalMatching !== undefined ? (
          <span className="matching-count-badge tabular-nums">
            {totalMatching} {totalMatching === 1 ? 'review' : 'reviews'}
          </span>
        ) : null}

        <div className="sort-select-wrapper">
          <label htmlFor="review-sort-select" className="visually-hidden">
            Sort reviews by
          </label>
          <select
            id="review-sort-select"
            value={sort}
            onChange={(e) =>
              onSelectSort(
                e.target.value as 'NEWEST' | 'RATING_DESC' | 'RATING_ASC' | 'WITH_PHOTOS',
              )
            }
            className="review-sort-dropdown"
          >
            <option value="NEWEST">Sort: Newest first</option>
            <option value="RATING_DESC">Sort: Highest rating</option>
            <option value="RATING_ASC">Sort: Lowest rating</option>
            <option value="WITH_PHOTOS">Sort: Customer photos</option>
          </select>
        </div>
      </div>
    </div>
  );
}
