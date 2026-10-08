import React, { lazy, Suspense } from "react";
import "react-toastify/dist/ReactToastify.css";
const Routes = lazy(() => import("./routes"));

const App = () => {
  return (
    <Suspense fallback={<div role="status">Carregando atendimento…</div>}>
      <Routes />
    </Suspense>
  );
};

export default App;
