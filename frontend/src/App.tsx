import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./routes/AppShell";
import { LoginPage } from "./pages/Login";
import { OverviewPage } from "./pages/Overview";
import { ApisPage } from "./pages/Apis";
import { ApiDetailPage } from "./pages/ApiDetail";
import { CatalogPage } from "./pages/Catalog";
import { CatalogDetailPage } from "./pages/CatalogDetail";
import { ApprovalsPage } from "./pages/Approvals";
import { AuditPage } from "./pages/Audit";
import { AskPage } from "./pages/Ask";
import { RequestsPage } from "./pages/Requests";
import { RequestDetailPage } from "./pages/RequestDetail";
import { InsightsPage } from "./pages/Insights";
import { ReportDetailPage } from "./pages/ReportDetail";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/ask" element={<AskPage />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/requests/:id" element={<RequestDetailPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/insights/:id" element={<ReportDetailPage />} />
              <Route path="/apis" element={<ApisPage />} />
              <Route path="/apis/:id" element={<ApiDetailPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/:id" element={<CatalogDetailPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/audit" element={<AuditPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
