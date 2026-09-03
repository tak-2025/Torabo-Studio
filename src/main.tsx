import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { I18nProvider } from "./i18n";
import { KeyLayoutProvider } from "./keyboard/KeyLayoutContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <KeyLayoutProvider>
        <App />
      </KeyLayoutProvider>
    </I18nProvider>
  </React.StrictMode>
);
