import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Auth from "./pages/Auth.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ActorHealth from "./pages/ActorHealth.tsx";
import KeywordAudit from "./pages/KeywordAudit.tsx";
import Leads from "./pages/Leads.tsx";
import LeadDetail from "./pages/LeadDetail.tsx";
import Candidates from "./pages/Candidates.tsx";
import DiscoveryRuns from "./pages/DiscoveryRuns.tsx";
import DemandIntelligence from "./pages/DemandIntelligence.tsx";
import DemandLeadDetail from "./pages/DemandLeadDetail.tsx";
import Settings from "./pages/Settings.tsx";
import ArchivedLeads from "./pages/ArchivedLeads.tsx";
import Recruiters from "./pages/Recruiters.tsx";
import Campaign from "./pages/Campaign.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/actor-health" element={<ActorHealth />} />
            <Route path="/keyword-audit" element={<KeywordAudit />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/archived" element={<ArchivedLeads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/recruiters" element={<Recruiters />} />
            <Route path="/campaign" element={<Campaign />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/runs" element={<DiscoveryRuns />} />
            <Route path="/demand" element={<DemandIntelligence />} />
            <Route path="/demand/:id" element={<DemandLeadDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
