"use client";

import React, { useMemo, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import DataExplorerPage from "./DataExplorerPage";
import * as API from "../lib/apiClient";

export default function SqlFileExplorerPage() {
  const [session, setSession] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const adapter = useMemo(() => {
    if (!session?.sessionId) {
      return null;
    }

    const sessionId = session.sessionId;
    return {
      getOverview: () => API.getSqlExplorerOverview(sessionId),
      getTables: () => API.getSqlExplorerTables(sessionId),
      getTableColumns: (table) =>
        API.getSqlExplorerTableColumns(sessionId, table),
      getTableRows: (table, params) =>
        API.getSqlExplorerTableRows(sessionId, table, params),
      getTableAnalytics: (table, params) =>
        API.getSqlExplorerTableAnalytics(sessionId, table, params),
    };
  }, [session]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError("");
    setUploading(true);

    try {
      const response = await API.uploadSqlExplorerFile(file);
      setSession(response.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!adapter) {
    return (
      <div className="min-h-screen bg-slate-100 p-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                SQL File Explorer
              </h1>
              <p className="text-sm text-slate-500">
                Upload a SQL dump to browse tables and rows in the Inventory
                Explorer layout.
              </p>
            </div>
          </div>

          <label
            htmlFor="sql-explorer-file"
            className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center hover:border-blue-400"
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-blue-600" />
            <p className="text-lg font-semibold text-slate-800">
              {uploading ? "Uploading and indexing..." : "Choose SQL file"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Supports files up to 200MB
            </p>
          </label>
          <input
            id="sql-explorer-file"
            type="file"
            accept=".sql,.txt"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return <DataExplorerPage adapter={adapter} />;
}
