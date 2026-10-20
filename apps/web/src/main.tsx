import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initBackend } from './game/store';
import { applyToDocument } from './ui/settings';
import { unlockAudio } from './audio/sfx';
import { registerServiceWorker } from './pwa';
import './styles/base.css';
import './styles/card.css';
import './styles/combat.css';
import './styles/screens.css';
import './styles/tutorial.css';
import './styles/accounts.css';
import './styles/download.css';
import './styles/skies.css';
import './styles/polish.css';
import './styles/mechanics.css';
import './styles/responsive.css';
import './styles/perf.css';

applyToDocument();
void initBackend();
window.addEventListener('pointerdown', unlockAudio, { once: true });
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
