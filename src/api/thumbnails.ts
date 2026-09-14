import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import * as path from "path";

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const MAX_UPLOAD_SIZE = 10 << 20;

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File size is more than the allowed sizes");
  }
  const mediaType = file.type;
  const fileExtension = mediaType.split("/")[1];
  if (!fileExtension) {
    throw new BadRequestError("Invalid file type");
  }

  const imageData: ArrayBuffer = await file.arrayBuffer();

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("This video is uploaded by another user");
  }

  const fileName = `${videoId}.${fileExtension}`;
  const filePath = path.join(cfg.assetsRoot, fileName);
  await Bun.write(filePath, imageData);

  video.thumbnailURL = `http://localhost:${cfg.port}/assets/${fileName}`;
  updateVideo(cfg.db, video);
  return respondWithJSON(200, video);
}
