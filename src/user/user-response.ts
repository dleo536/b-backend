import { User } from "./user.entity";

export const toPublicUserResponse = (user: User) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    bio: user.bio ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bannerUrl: user.bannerUrl ?? null,
    location: user.location ?? null,
    websiteUrl: user.websiteUrl ?? null,
    favoriteGenres: user.favoriteGenres ?? [],
    favoriteArtists: user.favoriteArtists ?? [],
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
    reviewsCount: user.reviewsCount ?? 0,
    likesReceivedCount: user.likesReceivedCount ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

export const toSelfUserResponse = (user: User) => ({
    ...toPublicUserResponse(user),
    email: user.email ?? null,
});

export const toPublicUserResponses = (users: User[]) =>
    users.map((user) => toPublicUserResponse(user));
