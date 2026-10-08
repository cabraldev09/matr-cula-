import React, { lazy, Suspense } from "react";
import "react-toastify/dist/ReactToastify.css";
const Routes = lazy(() => import("./routes"));
const SaasApp = lazy(() => import("./saas/SaasApp"));

const App = () => {
  return (
    <Suspense fallback={<div role="status">Carregando atendimento…</div>}>
      {window.location.pathname.startsWith("/saas") ? <SaasApp /> : <Routes />}
    </Suspense>
  );
};

export default App;
