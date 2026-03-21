import { BadRequestException, ConflictException } from "@nestjs/common";
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
    id: "11111111-1111-4111-8111-111111111111",
    followingCount: 0,
    followersCount: 0,
  };

  const targetUser = {
    id: "22222222-2222-4222-8222-222222222222",
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
    expect(userRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: currentUser.id,
        followingCount: 1,
      }),
      expect.objectContaining({
        id: targetUser.id,
        followersCount: 1,
      }),
    ]);
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
    expect(userRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: currentUser.id,
        followingCount: 0,
      }),
      expect.objectContaining({
        id: targetUser.id,
        followersCount: 0,
      }),
    ]);
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

  it("create rejects a duplicate username", async () => {
    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where?.usernameLower === "takenname") {
        return Promise.resolve({ id: "existing-user-1" });
      }
      return Promise.resolve(null);
    });

    await expect(
      service.create({
        username: "TakenName",
        email: "unique@example.com",
        firstName: "Taken",
        lastName: "User",
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("create rejects a duplicate email", async () => {
    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where?.emailLower === "taken@example.com") {
        return Promise.resolve({ id: "existing-user-2" });
      }
      return Promise.resolve(null);
    });

    await expect(
      service.create({
        username: "FreshName",
        email: "taken@example.com",
        firstName: "Fresh",
        lastName: "User",
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("create rejects invalid email format", async () => {
    await expect(
      service.create({
        username: "FreshName",
        email: "not-an-email",
        firstName: "Fresh",
        lastName: "User",
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("checkAvailability reports existing username and email", async () => {
    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where?.usernameLower === "takenname") {
        return Promise.resolve({ id: "existing-user-1" });
      }
      if (where?.emailLower === "taken@example.com") {
        return Promise.resolve({ id: "existing-user-2" });
      }
      return Promise.resolve(null);
    });

    const result = await service.checkAvailability("TakenName", "taken@example.com");

    expect(result).toEqual({
      usernameAvailable: false,
      emailAvailable: false,
      usernameValid: true,
      emailValid: true,
    });
  });

  it("findOne resolves a Firebase oauthId without querying the uuid id column", async () => {
    const firebaseUid = "1csj3ZcjHOcpn2a6o0qOqeAVvKo1";
    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where?.oauthId === firebaseUid) {
        return Promise.resolve({
          id: currentUser.id,
          oauthId: firebaseUid,
        });
      }
      return Promise.resolve(null);
    });

    const result = await service.findOne(firebaseUid);

    expect(result).toEqual({
      id: currentUser.id,
      oauthId: firebaseUid,
    });
    expect(userRepository.findOne).toHaveBeenCalledTimes(1);
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { oauthId: firebaseUid },
    });
  });
});
