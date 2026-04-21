import fs from "fs";
import path from "path";
import multer from "multer";
import { analyzeSqlFileFromPath } from "../../../server/sqlAnalyzer";

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const uploadDir = path.resolve(process.cwd(), "uploads", "sql-analyzer");
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

const hasValidSqlExtension = (fileName = "") => /\.(sql|txt)$/i.test(fileName);
const isLikelySqlContent = (content = "") =>
  /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|WITH|USE|DELIMITER)\b/i.test(
    content,
  );

const readFilePreview = async (filePath, size = 64 * 1024) => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } finally {
    await handle.close();
  }
};

const deleteTempFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore cleanup failures
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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));
  } catch (error) {
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return res
        .status(413)
        .json({
          error: `File is too large. Max allowed size is ${MAX_UPLOAD_MB}MB.`,
        });
    }
    return res.status(400).json({ error: error.message });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = req.file.originalname || "uploaded.sql";
    const filePath = req.file.path;
    const previewContent = await readFilePreview(filePath);

    if (!previewContent.trim()) {
      await deleteTempFile(filePath);
      return res.status(400).json({ error: "Uploaded file is empty" });
    }

    if (
      !hasValidSqlExtension(fileName) &&
      !isLikelySqlContent(previewContent)
    ) {
      await deleteTempFile(filePath);
      return res.status(400).json({
        error:
          "File does not look like SQL. Upload .sql/.txt or include SQL statements.",
      });
    }

    const analysis = await analyzeSqlFileFromPath(filePath, {
      maxDetailedQueries: 200,
      maxQueryPreviewChars: 6000,
      lightweightThresholdChars: 50000,
    });

    await deleteTempFile(filePath);
    return res.status(200).json({
      fileName,
      fileSize: req.file.size,
      uploadedAt: new Date(),
      analysis,
    });
  } catch (error) {
    await deleteTempFile(req.file?.path);
    return res.status(500).json({ error: error.message });
  }
}
