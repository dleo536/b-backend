import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ListService } from "./list.service";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";
import { ListLike } from "./list-like.entity";

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe("ListService", () => {
  let service: ListService;
  let listRepository: MockRepository<AlbumList>;
  let userRepository: MockRepository<User>;
  let followRepository: MockRepository<UserFollow>;
  let listLikeRepository: MockRepository<ListLike>;

  beforeEach(async () => {
    listRepository = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    followRepository = {
      find: jest.fn(),
    };

    listLikeRepository = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListService,
        {
          provide: getRepositoryToken(AlbumList),
          useValue: listRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(UserFollow),
          useValue: followRepository,
        },
        {
          provide: getRepositoryToken(ListLike),
          useValue: listLikeRepository,
        },
      ],
    }).compile();

    service = module.get<ListService>(ListService);
  });

  it("returns an empty data array when current user has no lists", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "firebase-uid-123",
    });
    (listRepository.count as jest.Mock).mockResolvedValue(0);
    (listRepository.find as jest.Mock).mockResolvedValue([]);

    const result = await service.findAll("firebase-uid-123", 0, 10);

    expect(result).toEqual({
      data: [],
      hasMore: false,
      totalCount: 0,
      mode: "user",
    });
    expect(listRepository.count).toHaveBeenCalled();
    expect(listRepository.find).toHaveBeenCalled();
  });

  it("returns global user-created lists when viewer follows no one", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([]);
    (listRepository.count as jest.Mock).mockResolvedValue(1);
    (listRepository.find as jest.Mock).mockResolvedValue([{ id: "global-list-1" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([{ id: "global-list-1" }]);
    expect(result.mode).toBe("global");
    expect(listRepository.count).toHaveBeenCalledWith({
      where: { isSystem: false },
    });
    expect(listRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isSystem: false },
      }),
    );
  });

  it("falls back to global user-created lists when follows exist but followed users have no lists", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([
      { followerId: "11111111-1111-1111-1111-111111111111", followingId: "22222222-2222-2222-2222-222222222222" },
    ]);
    (listRepository.count as jest.Mock)
      .mockResolvedValueOnce(0) // followed-only count
      .mockResolvedValueOnce(2); // global fallback count
    (listRepository.find as jest.Mock).mockResolvedValue([{ id: "global-list-2" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([{ id: "global-list-2" }]);
    expect(result.mode).toBe("global-fallback");

    const firstCountCall = (listRepository.count as jest.Mock).mock.calls[0][0];
    expect(firstCountCall.where.isSystem).toBe(false);
    expect(firstCountCall.where.ownerId.value).toEqual([
      "22222222-2222-2222-2222-222222222222",
    ]);
    const findCall = (listRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where).toEqual({ isSystem: false });
  });

  it("returns followed-only user-created lists when followed users have list content", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([
      { followerId: "11111111-1111-1111-1111-111111111111", followingId: "22222222-2222-2222-2222-222222222222" },
    ]);
    (listRepository.count as jest.Mock).mockResolvedValue(1);
    (listRepository.find as jest.Mock).mockResolvedValue([{ id: "filtered-list-1" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([{ id: "filtered-list-1" }]);
    expect(result.mode).toBe("following");
    expect(listRepository.count).toHaveBeenCalledTimes(2);
    const findCall = (listRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where.isSystem).toBe(false);
    expect(findCall.where.ownerId.value.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("filters global lists by partial title when a title query is provided", async () => {
    (listRepository.count as jest.Mock).mockResolvedValue(1);
    (listRepository.find as jest.Mock).mockResolvedValue([{ id: "list-2025", title: "Best of 2025" }]);

    const result = await service.findAll(undefined, 0, 10, undefined, "2025");

    expect(result).toEqual({
      data: [{ id: "list-2025", title: "Best of 2025" }],
      hasMore: false,
      totalCount: 1,
      mode: "global",
    });

    const countCall = (listRepository.count as jest.Mock).mock.calls[0][0];
    expect(countCall.where.isSystem).toBe(false);
    expect(countCall.where.title?.value).toBe("%2025%");

    const findCall = (listRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where.isSystem).toBe(false);
    expect(findCall.where.title?.value).toBe("%2025%");
  });

  it("filters global lists by album membership when an album id query is provided", async () => {
    (listRepository.count as jest.Mock).mockResolvedValue(1);
    (listRepository.find as jest.Mock).mockResolvedValue([
      { id: "album-list-1", title: "Records with this album" },
    ]);

    const result = await service.findAll(undefined, 0, 10, undefined, undefined, "spotify-album-1");

    expect(result).toEqual({
      data: [{ id: "album-list-1", title: "Records with this album" }],
      hasMore: false,
      totalCount: 1,
      mode: "global",
    });

    const countCall = (listRepository.count as jest.Mock).mock.calls[0][0];
    expect(countCall.where.isSystem).toBe(false);
    expect(countCall.where.albumIds?.value).toEqual(["spotify-album-1"]);

    const findCall = (listRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where.isSystem).toBe(false);
    expect(findCall.where.albumIds?.value).toEqual(["spotify-album-1"]);
  });

  it("likeList creates a like row and increments likesCount", async () => {
    const viewer = {
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    };
    const list = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      likesCount: 2,
    };

    (userRepository.findOne as jest.Mock).mockResolvedValue(viewer);
    (listRepository.findOne as jest.Mock).mockResolvedValue({ ...list });
    (listLikeRepository.findOne as jest.Mock).mockResolvedValue(null);
    (listLikeRepository.create as jest.Mock).mockImplementation((value) => value);
    (listLikeRepository.save as jest.Mock).mockResolvedValue({
      userId: viewer.id,
      listId: list.id,
    });
    (listRepository.save as jest.Mock).mockResolvedValue({
      ...list,
      likesCount: 3,
    });

    const result = await service.likeList(list.id, viewer.oauthId);

    expect(result).toEqual({
      success: true,
      liked: true,
      listId: list.id,
      userId: viewer.id,
      likesCount: 3,
    });
    expect(listLikeRepository.save).toHaveBeenCalledWith({
      userId: viewer.id,
      listId: list.id,
    });
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: list.id,
        likesCount: 3,
      }),
    );
  });

  it("unlikeList removes a like row and decrements likesCount", async () => {
    const viewer = {
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    };
    const list = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      likesCount: 3,
    };

    (userRepository.findOne as jest.Mock).mockResolvedValue(viewer);
    (listRepository.findOne as jest.Mock).mockResolvedValue({ ...list });
    (listLikeRepository.findOne as jest.Mock).mockResolvedValue({
      userId: viewer.id,
      listId: list.id,
    });
    (listLikeRepository.remove as jest.Mock).mockResolvedValue({});
    (listRepository.save as jest.Mock).mockResolvedValue({
      ...list,
      likesCount: 2,
    });

    const result = await service.unlikeList(list.id, viewer.oauthId);

    expect(result).toEqual({
      success: true,
      liked: false,
      listId: list.id,
      userId: viewer.id,
      likesCount: 2,
    });
    expect(listLikeRepository.remove).toHaveBeenCalled();
    expect(listRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: list.id,
        likesCount: 2,
      }),
    );
  });

  it("getLikedLists returns liked list data for the viewer", async () => {
    const viewer = {
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    };
    const likedList = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Liked list",
    };

    (userRepository.findOne as jest.Mock).mockResolvedValue(viewer);
    (listLikeRepository.count as jest.Mock).mockResolvedValue(1);
    (listLikeRepository.find as jest.Mock).mockResolvedValue([
      {
        userId: viewer.id,
        listId: likedList.id,
        list: likedList,
      },
    ]);

    const result = await service.getLikedLists(viewer.oauthId, 0, 20);

    expect(result).toEqual({
      data: [likedList],
      hasMore: false,
      totalCount: 1,
    });
    expect(listLikeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: viewer.id },
        relations: ["list"],
      }),
    );
  });
});
