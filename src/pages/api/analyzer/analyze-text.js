import { analyzeSql } from "../../../server/sqlAnalyzer";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sqlQuery } = req.body || {};
    if (!sqlQuery) {
      return res.status(400).json({ error: "SQL query is required" });
    }

    const analysis = analyzeSql(sqlQuery);
    return res.status(200).json(analysis);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
