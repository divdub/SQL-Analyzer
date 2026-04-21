"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import {
  Database,
  Layers3,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Sigma,
  Filter,
  Table2,
  Activity,
} from "lucide-react";
import clsx from "clsx";
import { format, isValid, parseISO } from "date-fns";

const chartColors = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

const numericTypes = new Set([
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
const dateTypes = new Set(["date", "datetime", "timestamp", "time", "year"]);

const formatCellValue = (value, columnMeta) => {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-400">—</span>;
  }

  if (columnMeta && numericTypes.has(columnMeta.dataType)) {
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }
  }

  if (columnMeta && dateTypes.has(columnMeta.dataType)) {
    const parsed =
      typeof value === "string" ? parseISO(value) : new Date(value);
    if (isValid(parsed)) {
      return format(parsed, "dd MMM yyyy");
    }
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const StatCard = ({ icon: Icon, label, value, accent = "blue", subtext }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        {subtext ? (
          <p className="mt-1 text-sm text-slate-500">{subtext}</p>
        ) : null}
      </div>
      <div
        className={clsx(
          "rounded-2xl p-3",
          accent === "blue" && "bg-blue-50 text-blue-700",
          accent === "emerald" && "bg-emerald-50 text-emerald-700",
          accent === "amber" && "bg-amber-50 text-amber-700",
          accent === "violet" && "bg-violet-50 text-violet-700",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

export default function DataExplorerPage({ adapter }) {
  const [overview, setOverview] = useState(null);
  const [tables, setTables] = useState([]);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorHistory, setCursorHistory] = useState([]);
  const [currentCursor, setCurrentCursor] = useState(null);
  const [rowSearch, setRowSearch] = useState("");
  const [searchColumn, setSearchColumn] = useState("");
  const [metricColumn, setMetricColumn] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const pageSizeRef = useRef(pageSize);

  const selectedTableInfo = useMemo(
    () => tables.find((table) => table.tableName === selectedTable),
    [tables, selectedTable],
  );

  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter((table) =>
      table.tableName.toLowerCase().includes(query),
    );
  }, [tables, tableSearch]);

  const tableColumns = useMemo(() => {
    const metaColumns = selectedSchema?.columns || [];
    return metaColumns.map((column) => ({
      accessorKey: column.columnName,
      header: () => (
        <div className="flex min-w-0 flex-col text-left">
          <span className="truncate font-semibold text-slate-900">
            {column.columnName}
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {column.dataType}
          </span>
        </div>
      ),
      cell: (info) => (
        <span className="block max-w-[18rem] truncate text-slate-700">
          {formatCellValue(info.getValue(), column)}
        </span>
      ),
    }));
  }, [selectedSchema]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  useEffect(() => {
    const loadCatalog = async () => {
      setLoadingCatalog(true);
      setError("");
      try {
        const [overviewResponse, tablesResponse] = await Promise.all([
          adapter.getOverview(),
          adapter.getTables(),
        ]);

        setOverview(overviewResponse.data);
        setTables(tablesResponse.data.data || []);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load metadata",
        );
      } finally {
        setLoadingCatalog(false);
      }
    };

    loadCatalog();
  }, [adapter]);

  useEffect(() => {
    if (!selectedTable && filteredTables.length) {
      setSelectedTable(filteredTables[0].tableName);
    }
  }, [filteredTables, selectedTable]);

  useEffect(() => {
    if (!selectedTable) return;

    const loadTable = async () => {
      setLoadingRows(true);
      setError("");
      try {
        const schemaResponse = await adapter.getTableColumns(selectedTable);
        const schema = schemaResponse.data;
        const defaultSearchColumn =
          schema.searchableColumns[0] || schema.primaryKey || "";
        const defaultMetricColumn =
          schema.searchableColumns[0] ||
          schema.numericColumns[0] ||
          schema.dateColumns[0] ||
          schema.primaryKey ||
          "";

        setSelectedSchema(schema);
        setSearchColumn(defaultSearchColumn);
        setMetricColumn(defaultMetricColumn);
        setCursorHistory([]);
        setCurrentCursor(null);

        const rowsResponse = await adapter.getTableRows(selectedTable, {
          limit: pageSizeRef.current,
          search: "",
          searchColumn: defaultSearchColumn,
        });

        setRows(rowsResponse.data.rows || []);
        setNextCursor(rowsResponse.data.nextCursor || null);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load table data",
        );
      } finally {
        setLoadingRows(false);
      }
    };

    loadTable();
  }, [selectedTable, adapter]);

  useEffect(() => {
    if (!selectedTable || !selectedSchema || !metricColumn) return;

    const loadAnalytics = async () => {
      setLoadingAnalytics(true);
      setError("");
      try {
        const analyticsResponse = await adapter.getTableAnalytics(
          selectedTable,
          {
            metricColumn,
          },
        );
        setAnalytics(analyticsResponse.data);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load table analytics",
        );
      } finally {
        setLoadingAnalytics(false);
      }
    };

    loadAnalytics();
  }, [selectedTable, selectedSchema, metricColumn, adapter]);

  const refreshRows = async ({
    cursor = null,
    keepHistory = false,
    customSearch = rowSearch,
    customSearchColumn = searchColumn,
    limit = pageSizeRef.current,
  } = {}) => {
    if (!selectedTable) return;

    setLoadingRows(true);
    setError("");
    try {
      const response = await adapter.getTableRows(selectedTable, {
        limit,
        cursor,
        search: customSearch,
        searchColumn: customSearchColumn,
      });

      setRows(response.data.rows || []);
      setNextCursor(response.data.nextCursor || null);
      setCurrentCursor(cursor);

      if (!keepHistory) {
        setCursorHistory([]);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load table rows",
      );
    } finally {
      setLoadingRows(false);
    }
  };

  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    setRowSearch("");
    setCursorHistory([]);
    setCurrentCursor(null);
    setNextCursor(null);
    setAnalytics(null);
    setSelectedSchema(null);
  };

  const handleApplyFilters = () => {
    refreshRows({
      cursor: null,
      keepHistory: false,
      customSearch: rowSearch,
      customSearchColumn: searchColumn,
    });
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((previous) => [...previous, currentCursor]);
    refreshRows({
      cursor: nextCursor,
      keepHistory: true,
      customSearch: rowSearch,
      customSearchColumn: searchColumn,
    });
  };

  const handlePreviousPage = () => {
    if (!cursorHistory.length) return;
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((previous) => previous.slice(0, -1));
    refreshRows({
      cursor: previousCursor,
      keepHistory: true,
      customSearch: rowSearch,
      customSearchColumn: searchColumn,
    });
  };

  const overviewChartData = overview?.largestTables || [];
  const analyticsBars = analytics?.metricDistribution || [];
  const analyticsTrend = analytics?.dateTrend || [];
  const numericStats = analytics?.numericStats || [];
  const searchableColumns = selectedSchema?.searchableColumns || [];
  const metricOptions = useMemo(() => {
    const schema = selectedSchema || {
      searchableColumns: [],
      numericColumns: [],
      dateColumns: [],
    };
    return Array.from(
      new Set(
        [
          ...(schema.searchableColumns || []),
          ...(schema.numericColumns || []),
          ...(schema.dateColumns || []),
          schema.primaryKey,
        ].filter(Boolean),
      ),
    );
  }, [selectedSchema]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col lg:flex-row">
        <aside className="border-r border-slate-200 bg-white/95 lg:w-[22rem] lg:shrink-0">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg shadow-slate-900/20">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  SQL File Explorer
                </p>
                <h1 className="text-xl font-bold text-slate-900">
                  MySQL Explorer
                </h1>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Search tables"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-3 py-3">
            {filteredTables.map((table) => {
              const active = table.tableName === selectedTable;
              return (
                <button
                  key={table.tableName}
                  onClick={() => handleSelectTable(table.tableName)}
                  className={clsx(
                    "mb-2 w-full rounded-2xl border p-4 text-left transition-all",
                    active
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Table2
                          className={clsx(
                            "h-4 w-4",
                            active ? "text-blue-600" : "text-slate-400",
                          )}
                        />
                        <span className="truncate font-semibold text-slate-900">
                          {table.tableName}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {table.engine || "ENGINE N/A"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {Number(table.estimatedRows || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>{Number(table.columnCount || 0)} columns</span>
                    <span>{Number(table.sizeMB || 0).toFixed(2)} MB</span>
                  </div>
                </button>
              );
            })}
            {!filteredTables.length && !loadingCatalog ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No tables match your search.
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">
          <div className="border-b border-slate-200 bg-white/90 px-5 py-5 backdrop-blur-sm lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Production-grade analytics
                </p>
                <h2 className="mt-1 text-3xl font-bold text-slate-900">
                  {selectedTableInfo?.tableName || "Choose a table"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">
                  Browse millions of rows with server-side cursor pagination,
                  metadata-driven columns, and on-demand analytics.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    refreshRows({
                      cursor: null,
                      keepHistory: false,
                      customSearch: rowSearch,
                      customSearchColumn: searchColumn,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload table
                </button>
                <button
                  onClick={() =>
                    refreshRows({
                      cursor: null,
                      keepHistory: false,
                      customSearch: rowSearch,
                      customSearchColumn: searchColumn,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <Activity className="h-4 w-4" />
                  Refresh rows
                </button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-6 overflow-y-auto px-5 py-6 lg:px-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={Layers3}
                label="Tables"
                value={
                  overview?.summary?.totalTables?.toLocaleString("en-IN") || "0"
                }
                accent="blue"
                subtext="Discovered from uploaded SQL dump"
              />
              <StatCard
                icon={Database}
                label="Estimated Rows"
                value={
                  overview?.summary?.totalEstimatedRows?.toLocaleString(
                    "en-IN",
                  ) || "0"
                }
                accent="emerald"
                subtext="Uses MySQL metadata for speed"
              />
              <StatCard
                icon={Columns3}
                label="Columns"
                value={
                  selectedSchema?.columns?.length?.toLocaleString("en-IN") ||
                  "0"
                }
                accent="amber"
                subtext={
                  selectedTableInfo
                    ? `Table: ${selectedTableInfo.tableName}`
                    : "Select a table"
                }
              />
              <StatCard
                icon={Sigma}
                label="Selected rows"
                value={rows.length.toLocaleString("en-IN")}
                accent="violet"
                subtext={
                  nextCursor ? "More rows available" : "End of cursor page"
                }
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                      <Filter className="h-4 w-4" />
                      Row explorer
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      Cursor-based browsing
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Use the table selector and filters to load rows without
                      pulling the full dataset to the browser.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="min-w-[14rem]">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Search column
                      </label>
                      <select
                        value={searchColumn}
                        onChange={(event) =>
                          setSearchColumn(event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      >
                        {(searchableColumns.length
                          ? searchableColumns
                          : [selectedSchema?.primaryKey].filter(Boolean)
                        ).map((columnName) => (
                          <option key={columnName} value={columnName}>
                            {columnName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-[14rem]">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Rows per page
                      </label>
                      <select
                        value={pageSize}
                        onChange={(event) => {
                          const nextPageSize = Number(event.target.value);
                          setPageSize(nextPageSize);
                          refreshRows({
                            cursor: null,
                            keepHistory: false,
                            customSearch: rowSearch,
                            customSearchColumn: searchColumn,
                            limit: nextPageSize,
                          });
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      >
                        {[25, 50, 100, 150, 200].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      value={rowSearch}
                      onChange={(event) => setRowSearch(event.target.value)}
                      placeholder="Search the selected column"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </div>
                  <button
                    onClick={handleApplyFilters}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Apply filters
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5">
                    Cursor: {currentCursor ? "active" : "start"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5">
                    Searchable columns: {searchableColumns.length}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5">
                    Selected primary key: {selectedSchema?.primaryKey || "N/A"}
                  </span>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="max-h-[34rem] overflow-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50">
                        {table.getHeaderGroups().map((headerGroup) => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <th
                                key={header.id}
                                className="border-b border-slate-200 px-4 py-3 text-left align-top"
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext(),
                                    )}
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {loadingRows ? (
                          <tr>
                            <td
                              colSpan={tableColumns.length || 1}
                              className="px-4 py-10 text-center text-slate-500"
                            >
                              Loading rows...
                            </td>
                          </tr>
                        ) : table.getRowModel().rows.length ? (
                          table.getRowModel().rows.map((row) => (
                            <tr
                              key={row.id}
                              className="border-b border-slate-100 transition hover:bg-slate-50/80"
                            >
                              {row.getVisibleCells().map((cell) => (
                                <td
                                  key={cell.id}
                                  className="max-w-[18rem] border-b border-slate-100 px-4 py-3 align-top"
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={tableColumns.length || 1}
                              className="px-4 py-10 text-center text-slate-500"
                            >
                              No rows found for the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    Showing {rows.length.toLocaleString("en-IN")} rows at a time
                    with server-side cursor paging.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreviousPage}
                      disabled={!cursorHistory.length || loadingRows}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      onClick={handleNextPage}
                      disabled={!nextCursor || loadingRows}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Columns3 className="h-4 w-4" />
                    Schema summary
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    Table structure
                  </h3>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Primary key
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {selectedSchema?.primaryKey || "N/A"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Search columns
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {searchableColumns.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Numeric columns
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {selectedSchema?.numericColumns?.length || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Date columns
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {selectedSchema?.dateColumns?.length || 0}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Activity className="h-4 w-4" />
                    Analytics selector
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    Explore a column
                  </h3>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Metric column
                  </label>
                  <select
                    value={metricColumn}
                    onChange={(event) => setMetricColumn(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {metricOptions.map((columnName) => (
                      <option key={columnName} value={columnName}>
                        {columnName}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-sm text-slate-500">
                    The selected table analytics load on demand and only scan
                    the active table.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                      <Database className="h-4 w-4" />
                      Catalog overview
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-slate-900">
                      Largest tables by estimated rows
                    </h3>
                  </div>
                </div>
                <div className="mt-4 h-[320px]">
                  {overviewChartData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={overviewChartData}
                        layout="vertical"
                        margin={{ left: 8, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" />
                        <YAxis
                          dataKey="tableName"
                          type="category"
                          width={120}
                        />
                        <Tooltip />
                        <Legend />
                        <Bar
                          dataKey="estimatedRows"
                          name="Estimated rows"
                          fill="#2563eb"
                          radius={[0, 10, 10, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                      Table metrics will appear here once metadata loads.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Activity className="h-4 w-4" />
                  Selected table analytics
                </div>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  {metricColumn || "Choose a column"}
                </h3>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {numericStats.map((stat) => (
                    <div
                      key={stat.columnName}
                      className="rounded-2xl bg-slate-50 p-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {stat.columnName}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                        <span>
                          Min:{" "}
                          {Number(stat.minValue || 0).toLocaleString("en-IN")}
                        </span>
                        <span>
                          Max:{" "}
                          {Number(stat.maxValue || 0).toLocaleString("en-IN")}
                        </span>
                        <span>
                          Avg:{" "}
                          {Number(stat.avgValue || 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span>
                          Sum:{" "}
                          {Number(stat.sumValue || 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {!numericStats.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                      No numeric columns available for summary cards.
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Value distribution
                    </h4>
                    <div className="h-[240px]">
                      {loadingAnalytics ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          Loading analytics...
                        </div>
                      ) : analyticsBars.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analyticsBars}
                              dataKey="countValue"
                              nameKey="label"
                              outerRadius={90}
                              label
                            >
                              {analyticsBars.map((entry, index) => (
                                <Cell
                                  key={`${entry.label}-${index}`}
                                  fill={chartColors[index % chartColors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                          No distribution data available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Date trend
                    </h4>
                    <div className="h-[240px]">
                      {loadingAnalytics ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                          Loading analytics...
                        </div>
                      ) : analyticsTrend.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analyticsTrend}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#e2e8f0"
                            />
                            <XAxis dataKey="label" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="countValue"
                              stroke="#2563eb"
                              strokeWidth={2}
                              dot={false}
                              name="Records"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                          No date trend data available.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <Table2 className="h-4 w-4" />
                    Table details
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    {selectedTable || "No table selected"}
                  </h3>
                </div>
                <p className="text-sm text-slate-500">
                  {selectedTableInfo
                    ? `${Number(selectedTableInfo.estimatedRows || 0).toLocaleString("en-IN")} estimated rows · ${selectedTableInfo.columnCount || 0} columns`
                    : "Select a table from the sidebar to inspect rows."}
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
