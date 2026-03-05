import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ListService } from "./list.service";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe("ListService", () => {
  let service: ListService;
  let listRepository: MockRepository<AlbumList>;
  let userRepository: MockRepository<User>;

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
    });
    expect(listRepository.count).toHaveBeenCalled();
    expect(listRepository.find).toHaveBeenCalled();
  });
});
