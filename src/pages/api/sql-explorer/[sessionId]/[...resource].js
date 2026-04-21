import {
  getSqlDumpOverview,
  getSqlDumpTables,
  getSqlDumpColumns,
  getSqlDumpRows,
  getSqlDumpAnalytics,
} from "../../../../server/sqlDumpExplorerStore";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { sessionId, resource = [] } = req.query;

  try {
    if (resource.length === 1 && resource[0] === "overview") {
      return res.status(200).json(getSqlDumpOverview(sessionId));
    }

    if (resource.length === 1 && resource[0] === "tables") {
      return res.status(200).json(getSqlDumpTables(sessionId));
    }

    if (
      resource.length === 3 &&
      resource[0] === "tables" &&
      resource[2] === "columns"
    ) {
      return res.status(200).json(getSqlDumpColumns(sessionId, resource[1]));
    }

    if (
      resource.length === 3 &&
      resource[0] === "tables" &&
      resource[2] === "rows"
    ) {
      return res.status(200).json(
        getSqlDumpRows(sessionId, resource[1], {
          limit: req.query.limit,
          cursor: req.query.cursor,
          search: req.query.search,
          searchColumn: req.query.searchColumn,
        }),
      );
    }

    if (
      resource.length === 3 &&
      resource[0] === "tables" &&
      resource[2] === "analytics"
    ) {
      return res
        .status(200)
        .json(
          getSqlDumpAnalytics(sessionId, resource[1], req.query.metricColumn),
        );
    }

    return res.status(404).json({ message: "Route not found" });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
}
