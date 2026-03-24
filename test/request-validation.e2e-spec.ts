import { ArgumentMetadata, BadRequestException, ValidationPipe } from "@nestjs/common";
import { CreateListDto } from "../src/list/dto/create-list.dto";
import { CreateReviewDto } from "../src/review/dto/create-review.dto";
import { UpdateReviewDto } from "../src/review/dto/update-review.dto";
import { CreateUserDto } from "../src/user/dto/create-user.dto";
import { UpdateUserDto } from "../src/user/dto/update-user.dto";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const bodyMetadata = (metatype: ArgumentMetadata["metatype"]): ArgumentMetadata => ({
  type: "body",
  metatype,
  data: undefined,
});

describe("Request validation", () => {
  it("rejects missing required user fields with 400 semantics", async () => {
    await expect(
      pipe.transform(
        {
          username: "validname",
          lastName: "User",
        },
        bodyMetadata(CreateUserDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects extra undeclared user fields", async () => {
    await expect(
      pipe.transform(
        {
          username: "validname",
          firstName: "Valid",
          lastName: "User",
          roles: ["admin"],
        },
        bodyMetadata(CreateUserDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects legacy user patch fields", async () => {
    await expect(
      pipe.transform(
        {
          backlogListId: "list-1",
        },
        bodyMetadata(UpdateUserDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects internal-only list fields", async () => {
    await expect(
      pipe.transform(
        {
          title: "Favorites",
          slug: "favorites",
          isSystem: true,
        },
        bodyMetadata(CreateListDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid list enum values", async () => {
    await expect(
      pipe.transform(
        {
          title: "A list",
          slug: "a-list",
          visibility: "secret",
        },
        bodyMetadata(CreateListDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid review field types", async () => {
    await expect(
      pipe.transform(
        {
          releaseGroupMbId: "rg-1",
          albumTitleSnapshot: "Album",
          artistNameSnapshot: "Artist",
          ratingHalfSteps: "five",
        },
        bodyMetadata(CreateReviewDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects extra undeclared review update fields", async () => {
    await expect(
      pipe.transform(
        {
          likesCount: 999,
        },
        bodyMetadata(UpdateReviewDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
