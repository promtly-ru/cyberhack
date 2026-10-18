import { useEffect } from 'react';
import { useGame } from './game/store';
import { devScenario, type DevScenario } from './game/engine';
import { FxHost } from './fx/FxHost';
import { TooltipLayer } from './components/Tooltip';
import { MainMenu, ClassSelect } from './screens/MenuScreens';
import { ProfileScreen } from './screens/ProfileScreen';
import { HowToPlay } from './tutorial/HowToPlay';
import { DownloadScreen } from './download/DownloadScreen';
import { TutorialLayer } from './tutorial/Tutorial';
import { MapScreen } from './screens/MapScreen';
import { CombatScreen } from './screens/CombatScreen';
import { RewardScreen, CardPickScreen, ShopScreen, RestScreen, EventScreen, DeckSelectScreen, GameOverScreen } from './screens/RunScreens';
import { SettingsModal } from './screens/SettingsModal';
import { useUi } from './ui/uiStore';

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
    case 'event':
      return <EventScreen run={run} screen={sc} />;
    case 'select_deck_card':
      return <DeckSelectScreen key={sc.purpose} run={run} screen={sc} />;
    case 'game_over':
      return <GameOverScreen run={run} victory={sc.victory} />;
  }
}

export function App() {
  const view = useGame((s) => s.view);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const error = useGame((s) => s.error);

  useEffect(() => {
    // Dev-сценарии: ?dev=combat|map|shop|reward|card_pick|rest|event|deck|defeat|victory
    const kind = new URLSearchParams(location.search).get('dev') as DevScenario | null;
    if (!kind) return;
    const st = devScenario(kind);
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
      <TutorialLayer />
      <TooltipLayer />
    </>
  );
}
