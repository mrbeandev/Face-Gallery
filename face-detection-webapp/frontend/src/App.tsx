import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import UploadPage from "./pages/Upload";
import ProcessingPage from "./pages/Processing";
import ResultsPage from "./pages/Results";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/processing/:jobId" element={<ProcessingPage />} />
            <Route path="/results/:jobId" element={<ResultsPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
