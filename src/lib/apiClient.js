import axios from "axios";

const BASE = "/api";

export const uploadSqlExplorerFile = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return axios.post(`${BASE}/sql-explorer/upload`, formData);
};

export const getSqlExplorerOverview = (sessionId) =>
  axios.get(`${BASE}/sql-explorer/${encodeURIComponent(sessionId)}/overview`);

export const getSqlExplorerTables = (sessionId) =>
  axios.get(`${BASE}/sql-explorer/${encodeURIComponent(sessionId)}/tables`);

export const getSqlExplorerTableColumns = (sessionId, table) =>
  axios.get(
    `${BASE}/sql-explorer/${encodeURIComponent(sessionId)}/tables/${encodeURIComponent(table)}/columns`,
  );

export const getSqlExplorerTableRows = (sessionId, table, params) =>
  axios.get(
    `${BASE}/sql-explorer/${encodeURIComponent(sessionId)}/tables/${encodeURIComponent(table)}/rows`,
    { params },
  );

export const getSqlExplorerTableAnalytics = (sessionId, table, params) =>
  axios.get(
    `${BASE}/sql-explorer/${encodeURIComponent(sessionId)}/tables/${encodeURIComponent(table)}/analytics`,
    { params },
  );
