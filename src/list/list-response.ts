import { AlbumList } from "./list.entity";

const normalizeVisibility = (value?: string) =>
    value === undefined || value === null || value === ""
        ? "public"
        : value === "public"
        ? "public"
        : "private";

export const toListResponse = (list: AlbumList) => ({
    id: list.id,
    ownerId: list.ownerId,
    title: list.title,
    slug: list.slug,
    listType: list.listType,
    isSystem: list.isSystem,
    visibility: normalizeVisibility(list.visibility),
    description: list.description ?? null,
    albumIds: list.albumIds ?? [],
    coverUrl: list.coverUrl ?? null,
    itemsCount: list.itemsCount ?? 0,
    followersCount: list.followersCount ?? 0,
    likesCount: list.likesCount ?? 0,
    commentsCount: list.commentsCount ?? 0,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
});

export const toListResponses = (lists: AlbumList[]) =>
    lists.map((list) => toListResponse(list));
