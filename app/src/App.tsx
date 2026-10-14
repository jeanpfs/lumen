import { useEffect } from "react";
import { useRoute } from "./router";
import { AppProvider, useApp } from "./state/store";
import { BluetoothGate } from "./ui/BluetoothGate";
import { Shell } from "./ui/Shell";
import { Home } from "./screens/Home";
import { TargetPage } from "./screens/TargetPage";
import { Welcome } from "./screens/Welcome";
import { Wizard } from "./screens/Wizard";
import { FirstRun } from "./screens/FirstRun";

function Routes() {
  const [route, go] = useRoute();
  const { state } = useApp();

  useEffect(() => {
    document.getElementById("view")?.scrollTo(0, 0);
    document.querySelector<HTMLElement>("#view h1")?.focus({ preventScroll: true });
  }, [route.name, route.param]);

  // the wizard is full-screen, outside the shell
  if (route.name === "add") {
    return <Wizard recalibrate={route.param} onClose={() => (route.param ? go("strip", route.param) : go("home"))} go={go} />;
  }

  // nothing to control yet: only the way into the wizard, with no menus or header
  if (!state.loaded) return null;
  if (state.snapshot.strips.length === 0) {
    return state.onboarded ? <FirstRun go={go} /> : <Welcome onDone={() => go("add")} />;
  }

  return (
    <>
      <Shell route={route}>
        {route.name === "home" && <Home go={go} />}
        {route.name === "group" && route.param && (
          <TargetPage key={`g:${route.param}`} target={{ kind: "group", id: route.param }} tab={route.tab ?? "general"} go={go} />
        )}
        {route.name === "strip" && route.param && (
          <TargetPage key={`s:${route.param}`} target={{ kind: "strip", id: route.param }} tab={route.tab ?? "general"} from={route.from} go={go} />
        )}
      </Shell>
      {!state.onboarded && <Welcome onDone={() => undefined} />}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Routes />
      <BluetoothGate />
    </AppProvider>
  );
}
