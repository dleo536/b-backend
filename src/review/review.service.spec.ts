import { Test, TestingModule } from "@nestjs/testing";
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
    expect(reviewRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it("returns followed + self reviews when viewer follows users", async () => {
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
    const findCall = (reviewRepository.find as jest.Mock).mock.calls[0][0];
    expect(findCall.where.userId.value.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });
});
