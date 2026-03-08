import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserService } from "./user.service";
import { User } from "./user.entity";
import { UserFollow } from "./follow.entity";

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe("UserService follow behavior", () => {
  let service: UserService;
  let userRepository: MockRepository<User>;
  let followRepository: MockRepository<UserFollow>;

  const currentUser = {
    id: "11111111-1111-1111-1111-111111111111",
    followingCount: 0,
    followersCount: 0,
  };

  const targetUser = {
    id: "22222222-2222-2222-2222-222222222222",
    followingCount: 0,
    followersCount: 0,
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      find: jest.fn(),
    };

    followRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where?.id === currentUser.id) {
        return Promise.resolve({ ...currentUser });
      }
      if (where?.id === targetUser.id) {
        return Promise.resolve({ ...targetUser });
      }
      return Promise.resolve(null);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
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

    service = module.get<UserService>(UserService);
  });

  it("follow creates a row", async () => {
    (followRepository.findOne as jest.Mock).mockResolvedValue(null);
    (followRepository.create as jest.Mock).mockImplementation((value) => value);
    (followRepository.save as jest.Mock).mockResolvedValue({
      followerId: currentUser.id,
      followingId: targetUser.id,
    });
    (userRepository.save as jest.Mock).mockResolvedValue([]);

    const result = await service.followUser(currentUser.id, targetUser.id);

    expect(result.following).toBe(true);
    expect(followRepository.save).toHaveBeenCalledWith({
      followerId: currentUser.id,
      followingId: targetUser.id,
    });
    expect(userRepository.save).toHaveBeenCalled();
  });

  it("unfollow removes a row", async () => {
    (followRepository.findOne as jest.Mock).mockResolvedValue({
      followerId: currentUser.id,
      followingId: targetUser.id,
    });
    (followRepository.remove as jest.Mock).mockResolvedValue({});
    (userRepository.save as jest.Mock).mockResolvedValue([]);

    const result = await service.unfollowUser(currentUser.id, targetUser.id);

    expect(result.following).toBe(false);
    expect(followRepository.remove).toHaveBeenCalled();
    expect(userRepository.save).toHaveBeenCalled();
  });

  it("cannot follow self", async () => {
    await expect(service.followUser(currentUser.id, currentUser.id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("follow is idempotent when relationship already exists", async () => {
    (followRepository.findOne as jest.Mock).mockResolvedValue({
      followerId: currentUser.id,
      followingId: targetUser.id,
    });

    const result = await service.followUser(currentUser.id, targetUser.id);

    expect(result.following).toBe(true);
    expect(result.message).toBe("Already following user");
    expect(followRepository.save).not.toHaveBeenCalled();
  });
});
