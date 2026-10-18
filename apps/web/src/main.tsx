import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initBackend } from './game/store';
import { applyToDocument } from './ui/settings';
import { unlockAudio } from './audio/sfx';
import './styles/base.css';
import './styles/card.css';
import './styles/combat.css';
import './styles/screens.css';

applyToDocument();
void initBackend();
window.addEventListener('pointerdown', unlockAudio, { once: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
