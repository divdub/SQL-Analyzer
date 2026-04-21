import os from "os";
import path from "path";

export const getUploadDir = (scope) => {
  const uploadDir = path.join(os.tmpdir(), "task-uploads", scope);
  return uploadDir;
};
