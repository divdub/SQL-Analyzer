import { format } from "sql-formatter";
import Parser from "node-sql-parser";
import fs from "fs";
import readline from "readline";

const parser = new Parser.Parser();

/**
 * Analyze SQL query and extract comprehensive information
 */
export const analyzeSql = (sqlQuery, options = {}) => {
  try {
    const trimmedQuery = sqlQuery.trim();

    if (!trimmedQuery) {
      return { error: "Empty SQL query provided" };
    }

    const includeFormattedQuery = options.includeFormattedQuery !== false;
    const includeSuggestions = options.includeSuggestions !== false;
    const maxDeepAnalysisChars = options.maxDeepAnalysisChars ?? 200000;
    const useLightweight =
      options.lightweight === true ||
      trimmedQuery.length > maxDeepAnalysisChars;

    if (useLightweight) {
      return {
        originalQuery: trimmedQuery,
        formattedQuery: includeFormattedQuery
          ? formatSql(trimmedQuery)
          : undefined,
        queryType: detectQueryType(trimmedQuery),
        complexity: calculateComplexity(trimmedQuery),
        tables: extractTables(trimmedQuery),
        columns: [],
        joins: [],
        whereConditions: [],
        keywords: extractKeywords(trimmedQuery),
        suggestions: includeSuggestions
          ? [
              {
                type: "info",
                message:
                  "Large statement detected. Showing lightweight analysis for speed.",
                impact: "low",
              },
            ]
          : [],
        validationErrors: validateSql(trimmedQuery),
      };
    }

    const analysis = {
      originalQuery: trimmedQuery,
      formattedQuery: includeFormattedQuery
        ? formatSql(trimmedQuery)
        : undefined,
      queryType: detectQueryType(trimmedQuery),
      complexity: calculateComplexity(trimmedQuery),
      tables: extractTables(trimmedQuery),
      columns: extractColumns(trimmedQuery),
      joins: extractJoins(trimmedQuery),
      whereConditions: extractWhereConditions(trimmedQuery),
      keywords: extractKeywords(trimmedQuery),
      suggestions: includeSuggestions ? generateSuggestions(trimmedQuery) : [],
      validationErrors: validateSql(trimmedQuery),
    };

    return analysis;
  } catch (error) {
    return { error: `Analysis failed: ${error.message}` };
  }
};

/**
 * Format SQL query for better readability
 */
const formatSql = (query) => {
  try {
    return format(query, {
      language: "mysql",
      indent: "  ",
    });
  } catch (error) {
    return query; // Return original if formatting fails
  }
};

/**
 * Detect query type (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.)
 */
const detectQueryType = (query) => {
  const match = query.trim().match(/^\s*(\w+)/i);
  return match ? match[1].toUpperCase() : "UNKNOWN";
};

/**
 * Calculate query complexity score
 */
const calculateComplexity = (query) => {
  let score = 1;

  // Count JOINs
  const joinCount = (query.match(/\bJOIN\b/gi) || []).length;
  score += joinCount * 2;

  // Count subqueries
  const subqueryCount = (query.match(/\([\s\S]*?SELECT[\s\S]*?\)/gi) || [])
    .length;
  score += subqueryCount * 3;

  // Count conditions in WHERE clause
  const whereMatch = query.match(
    /WHERE\s+(.*?)(?:GROUP BY|ORDER BY|LIMIT|;|$)/i,
  );
  if (whereMatch) {
    const conditionCount = (whereMatch[1].match(/\bAND\b|\bOR\b/gi) || [])
      .length;
    score += conditionCount * 1.5;
  }

  // Count aggregate functions
  const aggregateCount = (
    query.match(/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\s*\(/gi) || []
  ).length;
  score += aggregateCount * 1.5;

  // Count UNION operations
  const unionCount = (query.match(/\bUNION\b/gi) || []).length;
  score += unionCount * 2;

  return {
    score: Math.min(Math.round(score), 10),
    level:
      score <= 3
        ? "Simple"
        : score <= 6
          ? "Moderate"
          : score <= 8
            ? "Complex"
            : "Very Complex",
    factors: {
      joins: joinCount,
      subqueries: subqueryCount,
      conditions: whereMatch
        ? (whereMatch[1].match(/\bAND\b|\bOR\b/gi) || []).length
        : 0,
      aggregates: aggregateCount,
      unions: unionCount,
    },
  };
};

/**
 * Extract table names from query
 */
const extractTables = (query) => {
  const tables = new Set();

  // Capture table references after FROM (supports quoted names and aliases)
  const fromPattern = /\bFROM\s+([`\w.]+)(?:\s+(?:AS\s+)?\w+)?/gi;
  let fromMatch;
  while ((fromMatch = fromPattern.exec(query)) !== null) {
    const cleaned = fromMatch[1].replace(/`/g, "").trim();
    if (cleaned) {
      tables.add(cleaned);
    }
  }

  // Pattern for JOIN clause
  const joinPattern = /\bJOIN\s+([`\w.]+)(?:\s+(?:AS\s+)?\w+)?/gi;
  let joinMatch;
  while ((joinMatch = joinPattern.exec(query)) !== null) {
    const table = joinMatch[1].replace(/`/g, "").trim();
    if (table) {
      tables.add(table);
    }
  }

  // Pattern for UPDATE clause
  const updateMatch = query.match(/UPDATE\s+(\w+|\`[\w]+\`)/i);
  if (updateMatch) {
    tables.add(updateMatch[1].replace(/`/g, ""));
  }

  // Pattern for INSERT INTO clause
  const insertMatch = query.match(/INSERT\s+INTO\s+(\w+|\`[\w]+\`)/i);
  if (insertMatch) {
    tables.add(insertMatch[1].replace(/`/g, ""));
  }

  return Array.from(tables);
};

/**
 * Extract column references from query
 */
const extractColumns = (query) => {
  const columns = new Map();

  // Extract columns from SELECT clause
  const selectMatch = query.match(
    /SELECT\s+(.*?)(?:FROM|WHERE|GROUP|ORDER|LIMIT|;|$)/is,
  );
  if (selectMatch) {
    const selectPart = selectMatch[1];
    // Simple regex to find column patterns
    const columnMatches =
      selectPart.match(/(\w+\.\w+|\w+|\*|`[\w]+`|`\w+`\.`\w+`)/g) || [];
    columnMatches.forEach((col) => {
      const cleaned = col.replace(/`/g, "");
      if (!columns.has(cleaned)) {
        columns.set(cleaned, { type: "SELECT", count: 1 });
      }
    });
  }

  // Extract columns from WHERE clause
  const whereMatch = query.match(/WHERE\s+(.*?)(?:GROUP|ORDER|LIMIT|;|$)/i);
  if (whereMatch) {
    const wherePart = whereMatch[1];
    const columnMatches = wherePart.match(/(\w+\.\w+|\w+)(?=\s*[<>=!])/g) || [];
    columnMatches.forEach((col) => {
      const cleaned = col.replace(/`/g, "");
      if (columns.has(cleaned)) {
        columns.get(cleaned).count += 1;
      } else {
        columns.set(cleaned, { type: "WHERE", count: 1 });
      }
    });
  }

  // Extract columns from GROUP BY clause
  const groupMatch = query.match(
    /GROUP\s+BY\s+(.*?)(?:HAVING|ORDER|LIMIT|;|$)/i,
  );
  if (groupMatch) {
    const groupPart = groupMatch[1];
    const columnMatches = groupPart.match(/(\w+\.\w+|\w+)/g) || [];
    columnMatches.forEach((col) => {
      const cleaned = col.replace(/`/g, "");
      if (columns.has(cleaned)) {
        columns.get(cleaned).type += ", GROUP BY";
      } else {
        columns.set(cleaned, { type: "GROUP BY", count: 1 });
      }
    });
  }

  // Extract columns from ORDER BY clause
  const orderMatch = query.match(/ORDER\s+BY\s+(.*?)(?:LIMIT|;|$)/i);
  if (orderMatch) {
    const orderPart = orderMatch[1];
    const columnMatches =
      orderPart.match(/(\w+\.\w+|\w+)(?=\s|,|$|\s+(ASC|DESC))/gi) || [];
    columnMatches.forEach((col) => {
      const cleaned = col.replace(/`/g, "").trim();
      if (columns.has(cleaned)) {
        columns.get(cleaned).type += ", ORDER BY";
      } else {
        columns.set(cleaned, { type: "ORDER BY", count: 1 });
      }
    });
  }

  return Array.from(columns, ([name, value]) => ({
    name,
    ...value,
  }));
};

/**
 * Extract JOIN information
 */
const extractJoins = (query) => {
  const joins = [];
  const joinPattern =
    /(\w+\s+)?JOIN\s+(\w+|\`[\w]+\`)(?:\s+(?:ON|USING))?([^JOIN]*)(?=JOIN|WHERE|GROUP|ORDER|LIMIT|;|$)/gi;

  let match;
  while ((match = joinPattern.exec(query)) !== null) {
    joins.push({
      type: (match[1] || "INNER").trim().toUpperCase(),
      table: match[2].replace(/`/g, ""),
      condition: match[3]?.trim() || "Not specified",
    });
  }

  return joins;
};

/**
 * Extract WHERE clause conditions
 */
const extractWhereConditions = (query) => {
  const whereMatch = query.match(/WHERE\s+(.*?)(?:GROUP|ORDER|LIMIT|;|$)/i);
  if (!whereMatch) return [];

  const conditions = [];
  const wherePart = whereMatch[1];

  // Split by AND/OR while preserving them
  const parts = wherePart.split(/\b(AND|OR)\b/i);

  for (let i = 0; i < parts.length; i += 2) {
    const condition = parts[i].trim();
    const operator = parts[i + 1] ? parts[i + 1].toUpperCase() : null;

    if (condition) {
      conditions.push({
        condition: condition,
        operator: operator,
      });
    }
  }

  return conditions;
};

/**
 * Extract all SQL keywords used
 */
const extractKeywords = (query) => {
  const keywords = new Set();
  const sqlKeywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "CROSS",
    "ON",
    "GROUP",
    "BY",
    "HAVING",
    "ORDER",
    "ASC",
    "DESC",
    "LIMIT",
    "OFFSET",
    "UNION",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "TABLE",
    "DATABASE",
    "VIEW",
    "INDEX",
    "DISTINCT",
    "ALL",
    "CASE",
    "WHEN",
    "THEN",
    "ELSE",
    "END",
    "AND",
    "OR",
    "NOT",
    "IN",
    "EXISTS",
    "BETWEEN",
    "LIKE",
    "IS",
    "NULL",
  ];

  sqlKeywords.forEach((keyword) => {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(query)) {
      keywords.add(keyword);
    }
  });

  return Array.from(keywords);
};

/**
 * Generate optimization suggestions
 */
const generateSuggestions = (query) => {
  const suggestions = [];

  // Check for SELECT *
  if (/SELECT\s+\*/i.test(query)) {
    suggestions.push({
      type: "warning",
      message: "Avoid using SELECT *. Specify only needed columns.",
      impact: "high",
    });
  }

  // Check for unindexed columns in WHERE
  if (/WHERE\s+/i.test(query)) {
    suggestions.push({
      type: "info",
      message: "Ensure columns in WHERE clause have proper indexes.",
      impact: "high",
    });
  }

  // Check for multiple JOINs
  const joinCount = (query.match(/\bJOIN\b/gi) || []).length;
  if (joinCount > 4) {
    suggestions.push({
      type: "warning",
      message: `Query has ${joinCount} JOINs. Consider breaking into multiple queries.`,
      impact: "medium",
    });
  }

  // Check for subqueries
  if (/\([\s\S]*?SELECT[\s\S]*?\)/i.test(query)) {
    suggestions.push({
      type: "info",
      message: "Consider using JOIN instead of subquery if possible.",
      impact: "medium",
    });
  }

  // Check for LIKE with leading wildcard
  if (/LIKE\s+['"%]/i.test(query)) {
    suggestions.push({
      type: "warning",
      message: "Leading wildcard in LIKE slows index usage.",
      impact: "medium",
    });
  }

  // Check for NOT IN with subquery
  if (/NOT\s+IN\s*\(/i.test(query)) {
    suggestions.push({
      type: "warning",
      message:
        "Consider using NOT EXISTS instead of NOT IN for better performance.",
      impact: "medium",
    });
  }

  // Check for functions on WHERE columns
  if (/WHERE\s+\w+\s*\(/i.test(query)) {
    suggestions.push({
      type: "warning",
      message:
        "Avoid functions on columns in WHERE clause (prevents index usage).",
      impact: "high",
    });
  }

  // Check for ORDER BY without LIMIT
  if (/ORDER\s+BY/i.test(query) && !/LIMIT/i.test(query)) {
    suggestions.push({
      type: "info",
      message: "Consider adding LIMIT if sorting large result sets.",
      impact: "low",
    });
  }

  // Check for DISTINCT without specific columns
  if (/SELECT\s+DISTINCT\s+\*/i.test(query)) {
    suggestions.push({
      type: "warning",
      message: "SELECT DISTINCT * is inefficient. Specify columns.",
      impact: "medium",
    });
  }

  return suggestions;
};

/**
 * Validate SQL syntax
 */
const validateSql = (query) => {
  const errors = [];

  // Check for balanced parentheses
  const openParens = (query.match(/\(/g) || []).length;
  const closeParens = (query.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push({
      type: "syntax",
      message: `Unbalanced parentheses: ${openParens} open, ${closeParens} close`,
    });
  }

  // Check for balanced quotes
  const singleQuotes = (query.match(/(?<!\\)'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    errors.push({
      type: "syntax",
      message: "Unbalanced single quotes",
    });
  }

  // Check for double quotes
  const doubleQuotes = (query.match(/(?<!\\)"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    errors.push({
      type: "syntax",
      message: "Unbalanced double quotes",
    });
  }

  // Check for missing FROM in SELECT
  if (/SELECT/i.test(query) && !/FROM/i.test(query) && !/UNION/i.test(query)) {
    if (!/SELECT\s+\d+|SELECT\s+NOW|SELECT\s+@/i.test(query)) {
      errors.push({
        type: "warning",
        message: "SELECT without FROM clause detected",
      });
    }
  }

  // Check for incomplete query
  if (!query.trim().match(/[;]?\s*$/)) {
    // Not necessarily an error, but worth noting
  }

  return errors;
};

/**
 * Analyze multiple SQL queries from a file
 */
export const analyzeSqlFile = (fileContent) => {
  // Split by semicolon to get individual queries
  const queries = fileContent
    .split(";")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  const analyses = queries.map((query, index) => ({
    queryNumber: index + 1,
    ...analyzeSql(query),
  }));

  return {
    totalQueries: queries.length,
    queries: analyses,
    summary: buildSummary(analyses),
  };
};

const buildSummary = (analyses) => ({
  queryTypes: analyses.reduce((acc, curr) => {
    const type = curr.queryType || "UNKNOWN";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {}),
  averageComplexity:
    analyses.length > 0
      ? (
          analyses.reduce((sum, q) => sum + (q.complexity?.score || 0), 0) /
          analyses.length
        ).toFixed(2)
      : "0.00",
  totalTables: [...new Set(analyses.flatMap((q) => q.tables || []))].length,
  totalErrors: analyses.reduce(
    (sum, q) => sum + (q.validationErrors?.length || 0),
    0,
  ),
});

/**
 * Analyze SQL file from disk without loading entire content into memory.
 */
export const analyzeSqlFileFromPath = async (filePath, options = {}) => {
  const maxDetailedQueries = options.maxDetailedQueries ?? 200;
  const maxQueryPreviewChars = options.maxQueryPreviewChars ?? 6000;
  const lightweightThresholdChars = options.lightweightThresholdChars ?? 50000;

  const analyses = [];
  const queryTypes = {};
  const tableSet = new Set();
  let complexitySum = 0;
  let totalErrors = 0;
  let queryBuffer = "";
  let queryNumber = 0;

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    queryBuffer += `${line}\n`;

    let separatorIndex = queryBuffer.indexOf(";");
    while (separatorIndex !== -1) {
      const query = queryBuffer.slice(0, separatorIndex).trim();
      queryBuffer = queryBuffer.slice(separatorIndex + 1);

      if (query.length > 0) {
        queryNumber += 1;

        const result = analyzeSql(query, {
          includeFormattedQuery: false,
          includeSuggestions: false,
          lightweight: query.length > lightweightThresholdChars,
          maxDeepAnalysisChars: lightweightThresholdChars,
        });

        const type = result.queryType || "UNKNOWN";
        queryTypes[type] = (queryTypes[type] || 0) + 1;
        complexitySum += result.complexity?.score || 0;
        totalErrors += result.validationErrors?.length || 0;
        (result.tables || []).forEach((table) => tableSet.add(table));

        if (queryNumber <= maxDetailedQueries) {
          const previewQuery =
            query.length > maxQueryPreviewChars
              ? `${query.slice(0, maxQueryPreviewChars)}\n-- query preview truncated`
              : query;

          analyses.push({
            queryNumber,
            ...result,
            originalQuery: previewQuery,
          });
        }
      }

      separatorIndex = queryBuffer.indexOf(";");
    }
  }

  const remaining = queryBuffer.trim();
  if (remaining.length > 0) {
    queryNumber += 1;

    const result = analyzeSql(remaining, {
      includeFormattedQuery: false,
      includeSuggestions: false,
      lightweight: remaining.length > lightweightThresholdChars,
      maxDeepAnalysisChars: lightweightThresholdChars,
    });

    const type = result.queryType || "UNKNOWN";
    queryTypes[type] = (queryTypes[type] || 0) + 1;
    complexitySum += result.complexity?.score || 0;
    totalErrors += result.validationErrors?.length || 0;
    (result.tables || []).forEach((table) => tableSet.add(table));

    if (queryNumber <= maxDetailedQueries) {
      const previewQuery =
        remaining.length > maxQueryPreviewChars
          ? `${remaining.slice(0, maxQueryPreviewChars)}\n-- query preview truncated`
          : remaining;

      analyses.push({
        queryNumber,
        ...result,
        originalQuery: previewQuery,
      });
    }
  }

  const totalQueries = queryNumber;
  return {
    totalQueries,
    queries: analyses,
    summary: {
      queryTypes,
      averageComplexity:
        totalQueries > 0 ? (complexitySum / totalQueries).toFixed(2) : "0.00",
      totalTables: tableSet.size,
      totalErrors,
      totalQueries,
    },
    meta: {
      detailedQueriesReturned: analyses.length,
      isTruncated: totalQueries > analyses.length,
    },
  };
};
