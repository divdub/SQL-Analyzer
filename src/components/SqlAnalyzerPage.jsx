"use client";

import React, { useState } from "react";
import { Upload, AlertCircle, Zap, Database, Eye } from "lucide-react";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const SqlAnalyzerPage = () => {
  const [file, setFile] = useState(null);
  const [sqlText, setSqlText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [formattedQuery, setFormattedQuery] = useState("");

  const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setError(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("file", uploadedFile);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch("/api/analyzer/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || `Failed to analyze file (${response.status})`,
        );
      }
      const data = payload;
      setAnalysis({
        ...data.analysis,
        fileName: data.fileName,
        fileSize: data.fileSize,
      });
      setFile(uploadedFile);
      setSqlText("");
      setFormattedQuery("");
    } catch (err) {
      if (err.name === "AbortError") {
        setError(
          "Analysis timed out after 3 minutes. Try a smaller file or fewer statements.",
        );
      } else {
        setError(err.message);
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleTextAnalyze = async () => {
    if (!sqlText.trim()) {
      setError("Please enter SQL query");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/analyzer/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sqlQuery: sqlText }),
      });

      if (!response.ok) throw new Error("Failed to analyze SQL");
      const data = await response.json();
      setAnalysis(data);
      setFile(null);
      setFormattedQuery(data.formattedQuery);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Database className="text-blue-400" size={40} />
            SQL Analyzer
          </h1>
          <p className="text-gray-300">
            Upload SQL files or paste queries to get detailed analysis and
            optimization suggestions
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === "upload"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-gray-300 hover:bg-slate-600"
            }`}
          >
            <Upload size={20} className="inline mr-2" />
            Upload File
          </button>
          <button
            onClick={() => setActiveTab("text")}
            className={`px-6 py-3 rounded-lg font-semibold transition ${
              activeTab === "text"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-gray-300 hover:bg-slate-600"
            }`}
          >
            <Eye size={20} className="inline mr-2" />
            Paste Query
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-1" />
            <div className="text-red-200">{error}</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Section */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 sticky top-8">
              <h2 className="text-xl font-bold text-white mb-4">
                {activeTab === "upload" ? "Upload SQL File" : "Enter SQL Query"}
              </h2>

              {activeTab === "upload" ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer">
                    <input
                      type="file"
                      accept=".sql,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-input"
                      disabled={loading}
                    />
                    <label
                      htmlFor="file-input"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="text-blue-400" size={32} />
                      <span className="text-gray-300 font-semibold">
                        Click to upload
                      </span>
                      <span className="text-gray-500 text-sm">
                        or drag and drop
                      </span>
                      <span className="text-gray-500 text-xs">
                        SQL files up to 200MB
                      </span>
                    </label>
                  </div>
                  {file && (
                    <div className="p-3 bg-green-900/20 border border-green-500 rounded text-green-200 text-sm">
                      ✓ {file.name}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={sqlText}
                    onChange={(e) => setSqlText(e.target.value)}
                    placeholder="Paste your SQL query here..."
                    className="w-full h-48 bg-slate-700 text-white border border-slate-600 rounded-lg p-3 focus:border-blue-500 focus:outline-none font-mono text-sm"
                  />
                  <button
                    onClick={handleTextAnalyze}
                    disabled={loading || !sqlText.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 rounded-lg transition"
                  >
                    {loading ? "Analyzing..." : "Analyze Query"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Analysis Results */}
          <div className="lg:col-span-2">
            {loading && (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                <p className="text-gray-300 mt-4">Analyzing SQL...</p>
                <p className="text-gray-500 text-sm mt-1">
                  Large files can take time; results are summarized for
                  performance.
                </p>
              </div>
            )}

            {analysis && !loading && (
              <div className="space-y-6">
                {/* File Information */}
                {file && (
                  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <h3 className="text-white font-semibold mb-2">
                      File Information
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                      <div>File: {analysis.fileName}</div>
                      <div>
                        Size: {(analysis.fileSize / 1024).toFixed(2)} KB
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary Statistics */}
                {analysis.summary && (
                  <div className="space-y-4">
                    {analysis.meta?.isTruncated && (
                      <div className="bg-amber-900/20 border border-amber-500 rounded-lg p-3 text-amber-200 text-sm">
                        Large file detected. Showing detailed results for first{" "}
                        {analysis.meta.detailedQueriesReturned} queries. Summary
                        includes all queries.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4">
                        <div className="text-gray-300 text-sm">
                          Total Queries
                        </div>
                        <div className="text-3xl font-bold text-blue-400">
                          {analysis.summary.totalQueries ||
                            analysis.queries?.length ||
                            1}
                        </div>
                      </div>
                      <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4">
                        <div className="text-gray-300 text-sm">
                          Avg Complexity
                        </div>
                        <div className="text-3xl font-bold text-purple-400">
                          {analysis.summary.averageComplexity}
                        </div>
                      </div>
                      <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
                        <div className="text-gray-300 text-sm">
                          Total Tables
                        </div>
                        <div className="text-3xl font-bold text-green-400">
                          {analysis.summary.totalTables}
                        </div>
                      </div>
                      <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
                        <div className="text-gray-300 text-sm">
                          Errors Found
                        </div>
                        <div className="text-3xl font-bold text-red-400">
                          {analysis.summary.totalErrors}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Query Type Distribution Chart */}
                {analysis.summary?.queryTypes &&
                  Object.keys(analysis.summary.queryTypes).length > 0 && (
                    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                      <h3 className="text-white font-semibold mb-4">
                        Query Types
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(
                              analysis.summary.queryTypes,
                            ).map(([name, value]) => ({ name, value }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {Object.keys(analysis.summary.queryTypes).map(
                              (_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ),
                            )}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                {/* Single Query Analysis */}
                {!analysis.summary && analysis.queryType && (
                  <SingleQueryAnalysis
                    analysis={analysis}
                    formattedQuery={formattedQuery}
                  />
                )}

                {/* Multiple Queries */}
                {analysis.queries &&
                  analysis.queries.map((query, idx) => (
                    <QueryDetails
                      key={idx}
                      query={query}
                      queryNumber={idx + 1}
                    />
                  ))}
              </div>
            )}

            {!loading && !analysis && (
              <div className="text-center py-12 text-gray-400">
                <Database size={48} className="mx-auto mb-4 opacity-50" />
                <p>Upload a SQL file or paste a query to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Component for single query analysis
const SingleQueryAnalysis = ({ analysis, formattedQuery }) => {
  return (
    <div className="space-y-6">
      {/* Formatted Query */}
      {formattedQuery && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">Formatted Query</h3>
          <pre className="bg-slate-900 p-3 rounded text-green-400 text-sm overflow-x-auto font-mono">
            {formattedQuery}
          </pre>
        </div>
      )}

      {/* Complexity */}
      {analysis.complexity && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">Query Complexity</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-300 text-sm">Level</div>
              <div className="text-2xl font-bold text-yellow-400">
                {analysis.complexity.level}
              </div>
            </div>
            <div>
              <div className="text-gray-300 text-sm">Score</div>
              <div className="text-2xl font-bold text-orange-400">
                {analysis.complexity.score}/10
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-300">
              JOINs:{" "}
              <span className="text-white font-semibold">
                {analysis.complexity.factors.joins}
              </span>
            </div>
            <div className="text-gray-300">
              Subqueries:{" "}
              <span className="text-white font-semibold">
                {analysis.complexity.factors.subqueries}
              </span>
            </div>
            <div className="text-gray-300">
              Conditions:{" "}
              <span className="text-white font-semibold">
                {analysis.complexity.factors.conditions}
              </span>
            </div>
            <div className="text-gray-300">
              Aggregates:{" "}
              <span className="text-white font-semibold">
                {analysis.complexity.factors.aggregates}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tables and Columns */}
      <div className="grid grid-cols-2 gap-4">
        {analysis.tables && analysis.tables.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 className="text-white font-semibold mb-3">Tables Used</h3>
            <div className="space-y-2">
              {analysis.tables.map((table, idx) => (
                <div
                  key={idx}
                  className="bg-slate-700 px-3 py-2 rounded text-gray-200 text-sm"
                >
                  {table}
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.columns && analysis.columns.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 className="text-white font-semibold mb-3">Columns Used</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {analysis.columns.slice(0, 8).map((col, idx) => (
                <div key={idx} className="text-gray-300 text-sm">
                  <span className="text-blue-400">{col.name}</span>
                  <span className="text-gray-500 ml-2">({col.type})</span>
                </div>
              ))}
              {analysis.columns.length > 8 && (
                <div className="text-gray-500 text-sm">
                  +{analysis.columns.length - 8} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* JOINs */}
      {analysis.joins && analysis.joins.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3">JOINs</h3>
          <div className="space-y-2">
            {analysis.joins.map((join, idx) => (
              <div key={idx} className="bg-slate-700 p-3 rounded text-sm">
                <div className="text-blue-300 font-semibold">
                  {join.type} JOIN
                </div>
                <div className="text-gray-300">Table: {join.table}</div>
                <div className="text-gray-500 text-xs mt-1">
                  {join.condition}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {analysis.validationErrors && analysis.validationErrors.length > 0 && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <h3 className="text-red-300 font-semibold mb-3 flex items-center gap-2">
            <AlertCircle size={20} />
            Validation Errors
          </h3>
          <div className="space-y-2">
            {analysis.validationErrors.map((err, idx) => (
              <div key={idx} className="text-red-200 text-sm">
                • {err.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {analysis.suggestions && analysis.suggestions.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Zap className="text-yellow-400" size={20} />
            Optimization Suggestions
          </h3>
          <div className="space-y-2">
            {analysis.suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className={`p-3 rounded text-sm ${
                  suggestion.type === "warning"
                    ? "bg-yellow-900/20 text-yellow-200 border border-yellow-500"
                    : "bg-blue-900/20 text-blue-200 border border-blue-500"
                }`}
              >
                <div className="font-semibold">{suggestion.message}</div>
                <div className="text-xs opacity-75 mt-1">
                  Impact:{" "}
                  <span className="capitalize">{suggestion.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Component for individual query in file
const QueryDetails = ({ query, queryNumber }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex justify-between items-center font-semibold text-white hover:text-blue-400 transition"
      >
        <span>
          Query {queryNumber}: {query.queryType}
          {query.complexity && (
            <span className="ml-3 text-sm text-gray-400">
              (Complexity: {query.complexity.level})
            </span>
          )}
        </span>
        <span>{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-600 space-y-3">
          <div className="text-gray-300 text-sm">
            <strong>Query:</strong>
            <pre className="bg-slate-900 p-2 rounded mt-2 overflow-x-auto font-mono text-xs">
              {query.originalQuery}
            </pre>
          </div>

          {query.tables && query.tables.length > 0 && (
            <div className="text-gray-300 text-sm">
              <strong>Tables:</strong> {query.tables.join(", ")}
            </div>
          )}

          {query.suggestions && query.suggestions.length > 0 && (
            <div className="text-sm">
              <strong className="text-gray-300">Suggestions:</strong>
              <div className="mt-2 space-y-1">
                {query.suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    className="text-yellow-300 text-xs bg-yellow-900/20 p-2 rounded"
                  >
                    • {sug.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SqlAnalyzerPage;
