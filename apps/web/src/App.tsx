import { lazy, Suspense, useEffect } from 'react';
import { useGame } from './game/store';
import { devScenario, type DevScenario } from './game/engine';
import { FxHost } from './fx/FxHost';
import { TooltipLayer } from './components/Tooltip';
import { MainMenu, ClassSelect } from './screens/MenuScreens';
import { LocalMigrationGate, ProfileScreen } from './screens/ProfileScreen';
import { HowToPlay } from './tutorial/HowToPlay';
import { DownloadScreen } from './download/DownloadScreen';
import { TutorialLayer } from './tutorial/Tutorial';
import { MapScreen } from './screens/MapScreen';
import { CombatScreen } from './screens/CombatScreen';
import { RewardScreen, CardPickScreen, ShopScreen, RestScreen, NodeScreen, ImplantNodeScreen, EventScreen, DeckSelectScreen, GameOverScreen } from './screens/RunScreens';
import { SettingsModal } from './screens/SettingsModal';
import { useHistoryNav } from './game/historyNav';
import { useUi } from './ui/uiStore';
import { UiOverlays } from './ui-adapter/UiOverlays';

const DevGallery = import.meta.env.DEV ? lazy(() => import('./dev/Gallery')) : null;

function RunView() {
  const run = useGame((s) => s.run);
  const held = useGame((s) => s.heldCombat);
  if (!run) return <MainMenu />;
  if (held) return <CombatScreen run={run} combat={held} frozen />;
  const sc = run.screen;
  switch (sc.kind) {
    case 'combat':
      return run.combat ? <CombatScreen key={run.floor} run={run} combat={run.combat} frozen={false} /> : <MapScreen run={run} />;
    case 'map':
      return <MapScreen run={run} />;
    case 'reward':
      return <RewardScreen run={run} screen={sc} />;
    case 'card_pick':
      return <CardPickScreen run={run} screen={sc} />;
    case 'shop':
      return <ShopScreen run={run} screen={sc} />;
    case 'rest':
      return <RestScreen run={run} />;
    case 'lab':
    case 'blackbox':
    case 'relay':
      return <NodeScreen run={run} kind={sc.kind} />;
    case 'implant_node':
      return <ImplantNodeScreen run={run} screen={sc} />;
    case 'event':
      return <EventScreen run={run} screen={sc} />;
    case 'select_deck_card':
      return <DeckSelectScreen key={sc.purpose} run={run} screen={sc} />;
    case 'game_over':
      return <GameOverScreen run={run} victory={sc.victory} />;
  }
}

export function App() {
  if (DevGallery && new URLSearchParams(location.search).has('gallery')) {
    return (
      <Suspense fallback={null}>
        <DevGallery />
      </Suspense>
    );
  }
  return <GameApp />;
}

function GameApp() {
  const view = useGame((s) => s.view);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const error = useGame((s) => s.error);
  useHistoryNav();

  useEffect(() => {
    // Dev-сценарии: ?dev=combat|map|shop|reward|card_pick|rest|event|deck|defeat|victory
    const kind = new URLSearchParams(location.search).get('dev') as DevScenario | null;
    if (!kind) return;
    let st = devScenario(kind);
    const dAct = new URLSearchParams(location.search).get('act');
    if (import.meta.env.DEV && st && dAct) st = { ...st, act: Number(dAct) as 1 | 2 | 3 | 4 };
    if (st) useGame.getState().loadRun(st, { seed: st.seed, classId: st.classId, ascension: st.ascension });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.view = view;
  }, [view]);

  return (
    <>
      <FxHost />
      <main className="app">
        {view === 'menu' ? <MainMenu /> : view === 'class_select' ? <ClassSelect /> : view === 'profile' ? <ProfileScreen /> : view === 'howto' ? <HowToPlay /> : view === 'download' ? <DownloadScreen /> : <RunView />}
      </main>
      {error && view === 'run' ? (
        <div className="toast" role="alert" onClick={() => useGame.getState().clearError()}>
          {error}
        </div>
      ) : null}
      {settingsOpen ? <SettingsModal /> : null}
      <UiOverlays />
      <LocalMigrationGate />
      <TutorialLayer />
      <TooltipLayer />
    </>
  );
}
