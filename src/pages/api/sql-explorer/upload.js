import fs from "fs";
import path from "path";
import multer from "multer";
import { createSqlDumpSession } from "../../../server/sqlDumpExplorerStore";
import { getUploadDir } from "../../../server/uploadPaths";

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const uploadDir = getUploadDir("sql-explorer");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = (file.originalname || "upload.sql").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const runMiddleware = (req, res, fn) =>
  new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });

const removeFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore cleanup errors
  }
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));
  } catch (err) {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: `File is too large. Max allowed size is ${MAX_UPLOAD_MB}MB.`,
      });
    }
    return res.status(400).json({ message: err.message });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const session = await createSqlDumpSession({
      filePath: req.file.path,
      fileName: req.file.originalname || "uploaded.sql",
      fileSize: req.file.size,
    });

    await removeFile(req.file.path);
    return res.status(200).json({
      sessionId: session.sessionId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });
  } catch (error) {
    await removeFile(req.file?.path);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
}
