import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StatusBadge } from "../components/StatusBadge";
import { ResultView, type AskResult } from "../pages/Ask";
import { RequestsPage } from "../pages/Requests";

vi.mock("../lib/api", async (orig) => {
  const actual = await orig<typeof import("../lib/api")>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});
import { api } from "../lib/api";

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const base: AskResult = { runId: "r1", status: "API_READY" };

describe("StatusBadge", () => {
  it("shows a readable label", () => {
    render(<StatusBadge value="WAITING_HITL" />);
    expect(screen.getByText("WAITING HITL")).toBeInTheDocument();
  });
});

describe("ResultView", () => {
  it("says a new API was generated and shows the endpoint", () => {
    wrap(
      <ResultView
        result={{ ...base, generated: true, callUrl: "/api/generated/foo?country=India", api: { id: "a", name: "Foo", path: "/api/generated/foo", classification: "INTERNAL" } }}
      />,
    );
    expect(screen.getByText(/new one was generated/i)).toBeInTheDocument();
    expect(screen.getByText("/api/generated/foo?country=India")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /call api/i })).toBeInTheDocument();
  });

  it("says an existing API answered when nothing was generated", () => {
    wrap(<ResultView result={{ ...base, callUrl: "/api/generated/customers" }} />);
    expect(screen.getByText(/existing API can answer/i)).toBeInTheDocument();
  });

  it("explains NO_DATA and hides the API panel", () => {
    wrap(<ResultView result={{ runId: "r", status: "NO_DATA", message: "No ETL pipeline exists." }} />);
    expect(screen.getByText(/No ETL pipeline exists/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /call api/i })).not.toBeInTheDocument();
  });

  it("tells a waiting user to get an approval and continue", () => {
    wrap(<ResultView result={{ runId: "r", status: "WAITING_HITL", reason: "Financial data requires approval." }} />);
    expect(screen.getByText(/Financial data requires approval/)).toBeInTheDocument();
    expect(screen.getByText(/ask again afterwards/i)).toBeInTheDocument();
  });

  it("renders the ETL timeline steps in order", () => {
    wrap(
      <ResultView
        result={{
          runId: "r", status: "WAITING_HITL", reason: "x",
          etl: {
            pipeline: "ERP suppliers → warehouse", status: "REQUESTED",
            events: [
              { at: "2026-09-24T10:00:00Z", step: "ETL Requested" },
              { at: "2026-09-24T10:00:05Z", step: "ETL Approved", detail: "by Sam" },
            ],
          },
        }}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("ETL Requested");
    expect(items[1]).toContain("ETL Approved");
  });

  it("lists validation problems on failure", () => {
    wrap(<ResultView result={{ runId: "r", status: "FAILED", error: "The generated API plan failed validation.", problems: ["select: unknown column s.x"] }} />);
    expect(screen.getByText(/failed validation/)).toBeInTheDocument();
    expect(screen.getByText(/unknown column s\.x/)).toBeInTheDocument();
  });
});

describe("Call API panel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows the pending-approval reason for an HTTP 202", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "PENDING_APPROVAL", reason: "Needs admin approval" }), { status: 202 }),
    );
    wrap(<ResultView result={{ ...base, callUrl: "/api/generated/payments" }} />);
    await userEvent.click(screen.getByRole("button", { name: /call api/i }));
    expect(await screen.findByText(/HTTP 202/)).toBeInTheDocument();
    expect(screen.getByText(/pending approval: Needs admin approval/)).toBeInTheDocument();
  });

  it("renders returned rows as a table", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ country: "India", n: 3 }, { country: "Brazil", n: 1 }] }), { status: 200 }),
    );
    wrap(<ResultView result={{ ...base, callUrl: "/api/generated/customers" }} />);
    await userEvent.click(screen.getByRole("button", { name: /call api/i }));
    expect(await screen.findByText("India")).toBeInTheDocument();
    expect(screen.getByText(/2 row\(s\)/)).toBeInTheDocument();
  });
});

describe("RequestsPage", () => {
  it("offers Resume only for approved requests and links to details", async () => {
    vi.mocked(api.get).mockResolvedValue({
      requests: [
        { id: "1", requestText: "approved question", status: "APPROVED", createdAt: "2026-09-24T10:00:00Z" },
        { id: "2", requestText: "done question", status: "API_READY", createdAt: "2026-09-24T10:01:00Z" },
        { id: "3", requestText: "waiting question", status: "WAITING_HITL", createdAt: "2026-09-24T10:02:00Z" },
      ],
    });
    wrap(<RequestsPage />);
    await waitFor(() => expect(screen.getByText("approved question")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: "Resume" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Check again" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "done question" })).toHaveAttribute("href", "/requests/2");
  });

  it("shows an empty state", async () => {
    vi.mocked(api.get).mockResolvedValue({ requests: [] });
    wrap(<RequestsPage />);
    expect(await screen.findByText(/No requests yet/)).toBeInTheDocument();
  });
});
