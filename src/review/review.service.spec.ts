import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ReviewService } from "./review.service";
import { Review } from "./review.entity";
import { User } from "../user/user.entity";
import { UserFollow } from "../user/follow.entity";

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe("ReviewService", () => {
  let service: ReviewService;
  let reviewRepository: MockRepository<Review>;
  let userRepository: MockRepository<User>;
  let followRepository: MockRepository<UserFollow>;

  beforeEach(async () => {
    reviewRepository = {
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        {
          provide: getRepositoryToken(Review),
          useValue: reviewRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(UserFollow),
          useValue: followRepository,
        },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  it("create uses the authenticated firebase uid to resolve the user and stores mapped userId", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      oauthId: "firebase-uid-1",
    });
    (reviewRepository.findOne as jest.Mock).mockResolvedValue(null);
    (reviewRepository.create as jest.Mock).mockImplementation((value) => value);
    (reviewRepository.save as jest.Mock).mockImplementation(async (value) => ({
      id: "review-1",
      ...value,
    }));

    const result = await service.create({
      releaseGroupMbId: "rg-1",
      albumTitleSnapshot: "Album",
      artistNameSnapshot: "Artist",
    }, "firebase-uid-1");

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { oauthId: "firebase-uid-1" },
    });
    expect(reviewRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        firebaseUid: "firebase-uid-1",
        visibility: "public",
      }),
    );
    expect(result.userId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("create preserves spotifyAlbumId when provided", async () => {
    const backendUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: backendUserId,
      oauthId: "firebase-uid-2",
    });
    (reviewRepository.findOne as jest.Mock).mockResolvedValue(null);
    (reviewRepository.create as jest.Mock).mockImplementation((value) => value);
    (reviewRepository.save as jest.Mock).mockImplementation(async (value) => ({
      id: "review-spotify",
      ...value,
    }));

    const result = await service.create({
      releaseGroupMbId: "rg-spotify",
      spotifyAlbumId: "spotify-album-1",
      albumTitleSnapshot: "Album",
      artistNameSnapshot: "Artist",
    }, "firebase-uid-2");

    expect(reviewRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: backendUserId,
        spotifyAlbumId: "spotify-album-1",
        visibility: "public",
      }),
    );
    expect(result.spotifyAlbumId).toBe("spotify-album-1");
  });

  it("create throws when no user identifier is provided", async () => {
    await expect(
      service.create({
        releaseGroupMbId: "rg-3",
        albumTitleSnapshot: "Album 3",
        artistNameSnapshot: "Artist 3",
      }, ""),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns global reviews when viewer follows no one", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([]);
    (reviewRepository.count as jest.Mock).mockResolvedValue(1);
    (reviewRepository.find as jest.Mock).mockResolvedValue([{ id: "global-review-1" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([
      expect.objectContaining({ id: "global-review-1", visibility: "public" }),
    ]);
    expect(result.mode).toBe("global");
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where).toEqual([
      { isDraft: false },
      { userId: "11111111-1111-1111-1111-111111111111", isDraft: true },
    ]);
  });

  it("falls back to global reviews when follows exist but followed users have no reviews", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([
      { followerId: "11111111-1111-1111-1111-111111111111", followingId: "22222222-2222-2222-2222-222222222222" },
    ]);
    (reviewRepository.count as jest.Mock)
      .mockResolvedValueOnce(0) // followed-only
      .mockResolvedValueOnce(2); // global fallback
    (reviewRepository.find as jest.Mock).mockResolvedValue([{ id: "global-review-2" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([
      expect.objectContaining({ id: "global-review-2", visibility: "public" }),
    ]);
    expect(result.mode).toBe("global-fallback");
    const firstCountCall = (reviewRepository.count as jest.Mock).mock.calls[0][0];
    expect(firstCountCall.where.userId.value).toEqual([
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(firstCountCall.where.isDraft).toBe(false);
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where).toEqual([
      { isDraft: false },
      { userId: "11111111-1111-1111-1111-111111111111", isDraft: true },
    ]);
  });

  it("returns followed-only reviews when followed users have review content", async () => {
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      oauthId: "viewer-uid",
    });
    (followRepository.find as jest.Mock).mockResolvedValue([
      { followerId: "11111111-1111-1111-1111-111111111111", followingId: "22222222-2222-2222-2222-222222222222" },
    ]);
    (reviewRepository.count as jest.Mock).mockResolvedValue(1);
    (reviewRepository.find as jest.Mock).mockResolvedValue([{ id: "filtered-review-1" }]);

    const result = await service.findAll(undefined, 0, 10, "viewer-uid");

    expect(result.data).toEqual([
      expect.objectContaining({ id: "filtered-review-1", visibility: "public" }),
    ]);
    expect(result.mode).toBe("following");
    expect(reviewRepository.count).toHaveBeenCalledTimes(2);
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where).toEqual([
      {
        userId: expect.objectContaining({
          value: expect.arrayContaining([
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
          ]),
        }),
        isDraft: false,
      },
      {
        userId: "11111111-1111-1111-1111-111111111111",
        isDraft: true,
      },
    ]);
  });

  it("filters global reviews by spotify album id when provided", async () => {
    (reviewRepository.count as jest.Mock).mockResolvedValue(1);
    (reviewRepository.find as jest.Mock).mockResolvedValue([
      { id: "album-review-1", spotifyAlbumId: "spotify-album-1" },
    ]);

    const result = await service.findAll(
      undefined,
      0,
      10,
      undefined,
      "spotify-album-1",
    );

    expect(result).toEqual({
      data: [expect.objectContaining({
        id: "album-review-1",
        spotifyAlbumId: "spotify-album-1",
        visibility: "public",
      })],
      hasMore: false,
      totalCount: 1,
      mode: "global",
    });
    expect(reviewRepository.count).toHaveBeenCalledWith({
      where: { spotifyAlbumId: "spotify-album-1", isDraft: false },
    });
    expect(reviewRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spotifyAlbumId: "spotify-album-1", isDraft: false },
      }),
    );
  });

  it("returns drafts when the owner requests their own review list", async () => {
    (userRepository.findOne as jest.Mock)
      .mockResolvedValueOnce({
        id: "33333333-3333-4333-8333-333333333333",
        oauthId: "owner-uid",
      })
      .mockResolvedValueOnce({
        id: "33333333-3333-4333-8333-333333333333",
        oauthId: "owner-uid",
      });
    (reviewRepository.count as jest.Mock).mockResolvedValue(2);
    (reviewRepository.find as jest.Mock).mockResolvedValue([
      { id: "draft-review", isDraft: true },
      { id: "published-review", isDraft: false },
    ]);

    const result = await service.findAll("owner-uid", 0, 10, "owner-uid");

    expect(result.mode).toBe("user");
    expect(result.data).toHaveLength(2);
    const countCall = (reviewRepository.count as jest.Mock).mock.calls[0][0];
    expect(countCall.where).toEqual([
      { userId: "33333333-3333-4333-8333-333333333333" },
      { firebaseUid: "owner-uid" },
    ]);
  });

  it("filters drafts out when viewing another user's review list", async () => {
    (userRepository.findOne as jest.Mock)
      .mockResolvedValueOnce({
        id: "99999999-9999-4999-8999-999999999999",
        oauthId: "viewer-uid",
      })
      .mockResolvedValueOnce({
        id: "44444444-4444-4444-8444-444444444444",
        oauthId: "other-user-uid",
      });
    (reviewRepository.count as jest.Mock).mockResolvedValue(1);
    (reviewRepository.find as jest.Mock).mockResolvedValue([
      { id: "published-review", isDraft: false },
    ]);

    await service.findAll("other-user-uid", 0, 10, "viewer-uid");

    const countCall = (reviewRepository.count as jest.Mock).mock.calls[0][0];
    expect(countCall.where).toEqual([
      { userId: "44444444-4444-4444-8444-444444444444", isDraft: false },
      { firebaseUid: "other-user-uid", isDraft: false },
    ]);
  });

  it("rejects direct draft lookup for non-owners", async () => {
    (reviewRepository.findOne as jest.Mock).mockResolvedValue({
      id: "review-draft",
      userId: "55555555-5555-4555-8555-555555555555",
      firebaseUid: "owner-uid",
      isDraft: true,
      visibility: "private",
    });
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      oauthId: "viewer-uid",
    });

    await expect(service.findOne("review-draft", "viewer-uid")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("allows owners to read their own drafts", async () => {
    (reviewRepository.findOne as jest.Mock).mockResolvedValue({
      id: "review-draft",
      userId: "77777777-7777-4777-8777-777777777777",
      firebaseUid: "owner-uid",
      isDraft: true,
      visibility: "private",
    });
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      oauthId: "owner-uid",
    });

    await expect(service.findOne("review-draft", "owner-uid")).resolves.toEqual(
      expect.objectContaining({
        id: "review-draft",
        isDraft: true,
      }),
    );
  });
});
