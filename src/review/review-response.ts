import { Review } from "./review.entity";

const normalizeVisibility = (value?: string) =>
    value === undefined || value === null || value === ""
        ? "public"
        : value === "public"
        ? "public"
        : "private";

export const toReviewResponse = (review: Review) => ({
    id: review.id,
    userId: review.userId,
    releaseGroupMbId: review.releaseGroupMbId,
    releaseMbId: review.releaseMbId ?? null,
    artistMbId: review.artistMbId ?? null,
    spotifyAlbumId: review.spotifyAlbumId ?? null,
    albumTitleSnapshot: review.albumTitleSnapshot,
    artistNameSnapshot: review.artistNameSnapshot,
    coverUrlSnapshot: review.coverUrlSnapshot ?? null,
    ratingHalfSteps: review.ratingHalfSteps ?? null,
    headline: review.headline ?? null,
    body: review.body ?? null,
    isSpoiler: review.isSpoiler,
    isDraft: review.isDraft,
    visibility: normalizeVisibility(review.visibility),
    tags: review.tags ?? [],
    trackHighlights: review.trackHighlights ?? [],
    likesCount: review.likesCount ?? 0,
    commentsCount: review.commentsCount ?? 0,
    listenedOn: review.listenedOn ?? null,
    relistenCount: review.relistenCount ?? 0,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    publishedAt: review.publishedAt ?? null,
});

export const toReviewResponses = (reviews: Review[]) =>
    reviews.map((review) => toReviewResponse(review));
