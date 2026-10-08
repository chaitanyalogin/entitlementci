import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Reviewer } from "./reviewer";
import { App } from "./app";
import "./styles/app.css";
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        {import.meta.env.VITE_REVIEW_MODE === "true" ? <Reviewer /> : <App />}
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
