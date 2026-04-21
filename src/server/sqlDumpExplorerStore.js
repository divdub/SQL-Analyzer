import crypto from "crypto";
import fs from "fs";
import readline from "readline";

const TEXT_TYPES = new Set([
  "char",
  "varchar",
  "tinytext",
  "text",
  "mediumtext",
  "longtext",
  "enum",
  "set",
]);

const NUMERIC_TYPES = new Set([
  "tinyint",
  "smallint",
  "mediumint",
  "int",
  "bigint",
  "decimal",
  "numeric",
  "float",
  "double",
  "real",
]);

const DATE_TYPES = new Set(["date", "datetime", "timestamp", "time", "year"]);
const MAX_ROWS_PER_TABLE = 5000;
const SESSION_TTL_MS = 1000 * 60 * 60;

const sessions = new Map();

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
};

setInterval(cleanupExpiredSessions, 10 * 60 * 1000).unref();

const sanitizeValue = (value) => {
  if (value === "NULL") {
    return null;
  }

  if (/^'.*'$/.test(value)) {
    return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }

  return value;
};

const splitTopLevel = (text, separator = ",") => {
  const parts = [];
  let current = "";
  let inSingleQuote = false;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }

    if (ch === "'") {
      current += ch;
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
    }

    if (!inSingleQuote && depth === 0 && ch === separator) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const parseInsertStatement = (statement) => {
  const insertMatch = statement.match(
    /^INSERT\s+INTO\s+`?([A-Za-z0-9_]+)`?\s*(\(([^)]*)\))?\s+VALUES\s*(.*);\s*$/is,
  );

  if (!insertMatch) {
    return null;
  }

  const tableName = insertMatch[1];
  const explicitColumns = insertMatch[3]
    ? splitTopLevel(insertMatch[3]).map((col) => col.replace(/`/g, "").trim())
    : null;
  const valuesChunk = insertMatch[4].trim();

  const tupleMatches = [];
  let start = -1;
  let depth = 0;
  let inSingleQuote = false;
  let escaped = false;

  for (let i = 0; i < valuesChunk.length; i += 1) {
    const ch = valuesChunk[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (inSingleQuote) {
      continue;
    }

    if (ch === "(") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tupleMatches.push(valuesChunk.slice(start, i + 1));
        start = -1;
      }
    }
  }

  if (!tupleMatches.length) {
    return null;
  }

  const tuples = tupleMatches.map((tupleText) => {
    const body = tupleText.slice(1, -1);
    return splitTopLevel(body).map(sanitizeValue);
  });

  return {
    tableName,
    explicitColumns,
    tuples,
  };
};

const parseCreateTableBlock = (blockText) => {
  const tableMatch = blockText.match(/CREATE\s+TABLE\s+`?([A-Za-z0-9_]+)`?/i);
  if (!tableMatch) {
    return null;
  }

  const tableName = tableMatch[1];
  const openParen = blockText.indexOf("(");
  const closeParen = blockText.lastIndexOf(")");
  const body =
    openParen >= 0 && closeParen > openParen
      ? blockText.slice(openParen + 1, closeParen)
      : "";
  const definitions = splitTopLevel(body)
    .map((line) => line.trim())
    .filter(Boolean);

  const columns = [];
  let primaryKey = null;

  for (const line of definitions) {
    const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkMatch) {
      const keys = splitTopLevel(pkMatch[1]).map((name) =>
        name.replace(/`/g, "").trim(),
      );
      primaryKey = keys[0] || null;
      continue;
    }

    const columnMatch = line.match(/^`?([A-Za-z0-9_]+)`?\s+([A-Za-z]+)/i);
    if (columnMatch) {
      columns.push({
        columnName: columnMatch[1],
        dataType: columnMatch[2].toLowerCase(),
        columnType: line,
        isNullable: /NOT\s+NULL/i.test(line) ? "NO" : "YES",
        columnKey: "",
        columnDefault: null,
        extra: "",
        ordinalPosition: columns.length + 1,
      });
    }
  }

  if (primaryKey) {
    const pkColumn = columns.find((col) => col.columnName === primaryKey);
    if (pkColumn) {
      pkColumn.columnKey = "PRI";
    }
  }

  return {
    tableName,
    columns,
    primaryKey,
  };
};

const ensureTable = (dataset, tableName) => {
  if (!dataset.tables.has(tableName)) {
    dataset.tables.set(tableName, {
      tableName,
      engine: "InnoDB",
      estimatedRows: 0,
      sizeMB: 0,
      createdAt: null,
      updatedAt: null,
      columnCount: 0,
      primaryKey: null,
      columns: [],
      rows: [],
      totalRowsSeen: 0,
    });
  }

  return dataset.tables.get(tableName);
};

const inferDataType = (value) => {
  if (value === null || value === undefined) return "varchar";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "double";
  return "varchar";
};

const buildDatasetFromFile = async (filePath, fileName, fileSize) => {
  const dataset = {
    fileName,
    fileSize,
    createdAt: Date.now(),
    tables: new Map(),
  };

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let createBuffer = "";
  let insertBuffer = "";
  let inCreate = false;
  let inInsert = false;

  for await (const rawLine of rl) {
    const line = rawLine.trim();

    if (!line || line.startsWith("--") || line.startsWith("/*")) {
      continue;
    }

    if (/^CREATE\s+TABLE/i.test(line) || inCreate) {
      inCreate = true;
      createBuffer += `${rawLine}\n`;

      if (line.endsWith(";") || /^\)\s*ENGINE/i.test(line)) {
        inCreate = false;
        const parsedTable = parseCreateTableBlock(createBuffer);
        if (parsedTable) {
          const table = ensureTable(dataset, parsedTable.tableName);
          table.columns = parsedTable.columns;
          table.columnCount = parsedTable.columns.length;
          table.primaryKey = parsedTable.primaryKey;
        }
        createBuffer = "";
      }
      continue;
    }

    if (/^INSERT\s+INTO/i.test(line) || inInsert) {
      inInsert = true;
      insertBuffer += `${rawLine}\n`;

      if (line.endsWith(";")) {
        inInsert = false;
        const parsedInsert = parseInsertStatement(
          insertBuffer.replace(/\n/g, " "),
        );
        if (parsedInsert) {
          const table = ensureTable(dataset, parsedInsert.tableName);
          const existingColumns = table.columns.map((col) => col.columnName);

          let columns = parsedInsert.explicitColumns;
          if (!columns || !columns.length) {
            columns = existingColumns.length
              ? existingColumns
              : parsedInsert.tuples[0].map((_, index) => `col_${index + 1}`);
          }

          if (!table.columns.length) {
            table.columns = columns.map((columnName, index) => ({
              columnName,
              dataType: inferDataType(parsedInsert.tuples[0]?.[index]),
              columnType: inferDataType(parsedInsert.tuples[0]?.[index]),
              isNullable: "YES",
              columnKey: "",
              columnDefault: null,
              extra: "",
              ordinalPosition: index + 1,
            }));
            table.columnCount = table.columns.length;
            table.primaryKey = table.columns[0]?.columnName || null;
          }

          for (const tuple of parsedInsert.tuples) {
            table.totalRowsSeen += 1;
            table.estimatedRows = table.totalRowsSeen;
            if (table.rows.length >= MAX_ROWS_PER_TABLE) {
              continue;
            }

            const row = {};
            columns.forEach((columnName, index) => {
              row[columnName] = tuple[index] ?? null;
            });
            table.rows.push(row);
          }
        }
        insertBuffer = "";
      }
    }
  }

  for (const table of dataset.tables.values()) {
    const bytes = Buffer.byteLength(JSON.stringify(table.rows), "utf-8");
    table.sizeMB = Number((bytes / 1024 / 1024).toFixed(2));
  }

  return dataset;
};

const encodeCursor = (value) =>
  Buffer.from(String(value), "utf8").toString("base64");
const decodeCursor = (value) => {
  if (!value) return 0;
  const decoded = Number(Buffer.from(value, "base64").toString("utf8"));
  return Number.isNaN(decoded) ? 0 : decoded;
};

export const createSqlDumpSession = async ({
  filePath,
  fileName,
  fileSize,
}) => {
  const dataset = await buildDatasetFromFile(filePath, fileName, fileSize);
  const sessionId = crypto.randomUUID();

  sessions.set(sessionId, {
    id: sessionId,
    createdAt: Date.now(),
    dataset,
  });

  return { sessionId };
};

const getSession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    const error = new Error("File session not found or expired");
    error.statusCode = 404;
    throw error;
  }
  return session;
};

export const getSqlDumpOverview = (sessionId) => {
  const { dataset } = getSession(sessionId);
  const tables = Array.from(dataset.tables.values()).map((table) => ({
    tableName: table.tableName,
    engine: table.engine,
    estimatedRows: table.estimatedRows,
    sizeMB: table.sizeMB,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
    columnCount: table.columnCount,
    primaryKey: table.primaryKey,
  }));

  return {
    summary: {
      totalTables: tables.length,
      totalEstimatedRows: tables.reduce(
        (sum, table) => sum + Number(table.estimatedRows || 0),
        0,
      ),
      totalSizeMB: Number(
        tables
          .reduce((sum, table) => sum + Number(table.sizeMB || 0), 0)
          .toFixed(2),
      ),
    },
    tables,
    largestTables: [...tables]
      .sort((a, b) => b.estimatedRows - a.estimatedRows)
      .slice(0, 10),
  };
};

export const getSqlDumpTables = (sessionId) => {
  const { dataset } = getSession(sessionId);
  const data = Array.from(dataset.tables.values())
    .map((table) => ({
      tableName: table.tableName,
      engine: table.engine,
      estimatedRows: table.estimatedRows,
      sizeMB: table.sizeMB,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
      columnCount: table.columnCount,
      primaryKey: table.primaryKey,
    }))
    .sort(
      (a, b) =>
        b.estimatedRows - a.estimatedRows ||
        a.tableName.localeCompare(b.tableName),
    );

  return { data };
};

export const getSqlDumpColumns = (sessionId, tableName) => {
  const { dataset } = getSession(sessionId);
  const table = dataset.tables.get(tableName);
  if (!table) {
    const error = new Error("Table not found in uploaded SQL file");
    error.statusCode = 404;
    throw error;
  }

  const searchableColumns = table.columns
    .filter((column) => TEXT_TYPES.has(column.dataType))
    .map((column) => column.columnName);
  const numericColumns = table.columns
    .filter((column) => NUMERIC_TYPES.has(column.dataType))
    .map((column) => column.columnName);
  const dateColumns = table.columns
    .filter((column) => DATE_TYPES.has(column.dataType))
    .map((column) => column.columnName);

  return {
    table: tableName,
    primaryKey: table.primaryKey || table.columns[0]?.columnName || null,
    searchableColumns,
    numericColumns,
    dateColumns,
    columns: table.columns,
  };
};

export const getSqlDumpRows = (
  sessionId,
  tableName,
  { limit, cursor, search, searchColumn },
) => {
  const { dataset } = getSession(sessionId);
  const table = dataset.tables.get(tableName);
  if (!table) {
    const error = new Error("Table not found in uploaded SQL file");
    error.statusCode = 404;
    throw error;
  }

  const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offset = decodeCursor(cursor);

  let filteredRows = table.rows;
  if (search && searchColumn) {
    const query = String(search).toLowerCase();
    filteredRows = filteredRows.filter((row) =>
      String(row[searchColumn] ?? "")
        .toLowerCase()
        .includes(query),
    );
  }

  const rows = filteredRows.slice(offset, offset + pageLimit);
  const nextOffset = offset + pageLimit;
  const hasMore = nextOffset < filteredRows.length;

  return {
    table: tableName,
    primaryKey: table.primaryKey || table.columns[0]?.columnName || null,
    searchableColumns: table.columns
      .filter((column) => TEXT_TYPES.has(column.dataType))
      .map((column) => column.columnName),
    rows,
    nextCursor: hasMore ? encodeCursor(nextOffset) : null,
    hasMore,
    limit: pageLimit,
  };
};

const toMetricDistribution = (rows, columnName) => {
  const counts = new Map();
  rows.forEach((row) => {
    const key = String(row[columnName] ?? "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, countValue]) => ({ label, countValue }))
    .sort((a, b) => b.countValue - a.countValue)
    .slice(0, 10);
};

export const getSqlDumpAnalytics = (sessionId, tableName, metricColumn) => {
  const { dataset } = getSession(sessionId);
  const table = dataset.tables.get(tableName);
  if (!table) {
    const error = new Error("Table not found in uploaded SQL file");
    error.statusCode = 404;
    throw error;
  }

  const selectedMetric =
    table.columns.find((column) => column.columnName === metricColumn)
      ?.columnName ||
    table.columns[0]?.columnName ||
    null;

  return {
    summary: {
      estimatedRows: table.estimatedRows,
      sizeMB: table.sizeMB,
      engine: table.engine,
      columnCount: table.columnCount,
    },
    numericStats: [],
    metricDistribution: selectedMetric
      ? toMetricDistribution(table.rows, selectedMetric)
      : [],
    dateTrend: [],
    metricColumn: selectedMetric,
  };
};
