import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
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

  it("create uses firebaseUid to resolve user and stores mapped userId", async () => {
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
      firebaseUid: "firebase-uid-1",
      releaseGroupMbId: "rg-1",
      albumTitleSnapshot: "Album",
      artistNameSnapshot: "Artist",
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { oauthId: "firebase-uid-1" },
    });
    expect(reviewRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        firebaseUid: "firebase-uid-1",
      }),
    );
    expect(result.userId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("create uses backend uuid when provided via userId", async () => {
    const backendUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    (userRepository.findOne as jest.Mock).mockResolvedValue({
      id: backendUserId,
      oauthId: null,
    });
    (reviewRepository.findOne as jest.Mock).mockResolvedValue(null);
    (reviewRepository.create as jest.Mock).mockImplementation((value) => value);
    (reviewRepository.save as jest.Mock).mockImplementation(async (value) => ({
      id: "review-2",
      ...value,
    }));

    const result = await service.create({
      userId: backendUserId,
      releaseGroupMbId: "rg-2",
      albumTitleSnapshot: "Album 2",
      artistNameSnapshot: "Artist 2",
    });

    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: backendUserId },
    });
    expect(reviewRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: backendUserId,
      }),
    );
    expect(result.userId).toBe(backendUserId);
  });

  it("create throws when no user identifier is provided", async () => {
    await expect(
      service.create({
        releaseGroupMbId: "rg-3",
        albumTitleSnapshot: "Album 3",
        artistNameSnapshot: "Artist 3",
      }),
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

    expect(result.data).toEqual([{ id: "global-review-1" }]);
    expect(result.mode).toBe("global");
    expect(reviewRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
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

    expect(result.data).toEqual([{ id: "global-review-2" }]);
    expect(result.mode).toBe("global-fallback");
    const firstCountCall = (reviewRepository.count as jest.Mock).mock.calls[0][0];
    expect(firstCountCall.where.userId.value).toEqual([
      "22222222-2222-2222-2222-222222222222",
    ]);
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where).toEqual({});
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

    expect(result.data).toEqual([{ id: "filtered-review-1" }]);
    expect(result.mode).toBe("following");
    expect(reviewRepository.count).toHaveBeenCalledTimes(2);
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where.userId.value.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });
});
