import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository, QueryFailedError } from "typeorm";
import { ModerationService } from "./moderation.service";
import { ContentReport } from "./content-report.entity";
import { UserBlock } from "./user-block.entity";
import { User } from "../user/user.entity";
import { Review } from "../review/review.entity";
import { AlbumList } from "../list/list.entity";
import { UserFollow } from "../user/follow.entity";

type MockRepository<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe("ModerationService", () => {
    let service: ModerationService;
    let userBlockRepository: MockRepository<UserBlock>;

    beforeEach(async () => {
        userBlockRepository = {
            find: jest.fn(),
            findOne: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ModerationService,
                {
                    provide: getRepositoryToken(ContentReport),
                    useValue: {},
                },
                {
                    provide: getRepositoryToken(UserBlock),
                    useValue: userBlockRepository,
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: {},
                },
                {
                    provide: getRepositoryToken(Review),
                    useValue: {},
                },
                {
                    provide: getRepositoryToken(AlbumList),
                    useValue: {},
                },
                {
                    provide: getRepositoryToken(UserFollow),
                    useValue: {},
                },
            ],
        }).compile();

        service = module.get<ModerationService>(ModerationService);
    });

    it("returns an empty exclusion list when the user_blocks table is missing", async () => {
        const warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation();
        (userBlockRepository.find as jest.Mock).mockRejectedValue(
            new QueryFailedError("SELECT 1", [], {
                code: "42P01",
                message: 'relation "user_blocks" does not exist',
            }),
        );

        await expect(
            service.getVisibilityExcludedUserIds("11111111-1111-1111-1111-111111111111"),
        ).resolves.toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
            'Skipping visibility exclusions because relation "user_blocks" is missing. Run pending migrations.',
        );
    });

    it("treats missing user_blocks table as no active block relationship", async () => {
        const warnSpy = jest.spyOn((service as any).logger, "warn").mockImplementation();
        (userBlockRepository.findOne as jest.Mock).mockRejectedValue(
            new QueryFailedError("SELECT 1", [], {
                code: "42P01",
                message: 'relation "user_blocks" does not exist',
            }),
        );

        await expect(
            service.isBlockedBetweenUsersByIds(
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222",
            ),
        ).resolves.toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
            'Skipping block lookup because relation "user_blocks" is missing. Run pending migrations.',
        );
    });
});
