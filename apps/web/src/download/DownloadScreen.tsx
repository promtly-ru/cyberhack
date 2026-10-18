/**
 * Экран «Скачать»: установщики под текущее устройство (автоопределение) и под любое другое.
 * Ссылки берутся с последнего релиза GitHub, поэтому версию вручную менять не нужно.
 */
import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { Icon } from '../components/Icon';
import { SelectHead } from '../screens/MenuScreens';
import { isNativeShell } from '../pwa';

const REPO = 'promtly-ru/cyberhack';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

type PlatformId = 'windows' | 'macos' | 'linux' | 'android' | 'ios';

interface Platform {
  id: PlatformId;
  label: string;
  /** Файлы релиза: подпись, подсказка, регулярка по имени */
  files: { label: string; hint: string; re: RegExp }[];
  note: string;
}

const PLATFORMS: Platform[] = [
  {
    id: 'windows',
    label: 'Windows',
    files: [
      { label: 'Установщик .exe', hint: 'Windows 10 и новее', re: /_x64-setup\.exe$/ },
      { label: 'Установщик .msi', hint: 'для администраторов', re: /_x64_en-US\.msi$/ },
    ],
    note: 'Сборка не подписана: Windows предупредит при первом запуске. Нажми «Подробнее» → «Выполнить в любом случае».',
  },
  {
    id: 'macos',
    label: 'macOS',
    files: [{ label: 'Образ .dmg', hint: 'Apple Silicon (M1 и новее)', re: /_aarch64\.dmg$/ }],
    note: 'Сборка не подписана: правый клик по приложению → «Открыть». Если macOS пишет «повреждено», выполни в Терминале: xattr -cr /Applications/CyberHack.app',
  },
  {
    id: 'linux',
    label: 'Linux',
    files: [
      { label: 'AppImage', hint: 'запускается везде', re: /\.AppImage$/ },
      { label: 'Пакет .deb', hint: 'Debian, Ubuntu', re: /\.deb$/ },
      { label: 'Пакет .rpm', hint: 'Fedora, openSUSE', re: /\.rpm$/ },
    ],
    note: 'Для AppImage сделай файл исполняемым: chmod +x CyberHack_*.AppImage',
  },
  {
    id: 'android',
    label: 'Android',
    files: [{ label: 'Файл .apk', hint: 'Android 7 и новее', re: /android.*\.apk$/ }],
    note: 'Разреши установку из неизвестных источников. Файл подписан тестовым ключом, поэтому новую версию иногда придётся ставить поверх удалённой старой.',
  },
  { id: 'ios', label: 'iPhone / iPad', files: [], note: '' },
];

interface Asset {
  name: string;
  browser_download_url: string;
}
interface Release {
  tag: string;
  assets: Asset[];
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
let installEvent: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
  });
}

export function detectPlatform(ua: string = navigator.userAgent, maxTouch: number = navigator.maxTouchPoints): PlatformId {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouch > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/macintosh|mac os/i.test(ua)) return 'macos';
  if (/linux|x11|cros/i.test(ua)) return 'linux';
  return 'windows';
}

/** Игра уже установлена (PWA в отдельном окне или нативная оболочка) — пункт «Скачать» не нужен. */
export function isInstalledApp(): boolean {
  try {
    return isNativeShell() || window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

async function loadRelease(): Promise<Release | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=1`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const list = (await res.json()) as { tag_name?: string; assets?: Asset[] }[];
    const r = list[0];
    return r?.assets ? { tag: r.tag_name ?? '', assets: r.assets } : null;
  } catch {
    return null;
  }
}

export function DownloadScreen() {
  const setView = useGame((s) => s.setView);
  const [current, setCurrent] = useState<PlatformId>(() => detectPlatform());
  const [release, setRelease] = useState<Release | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [canInstall, setCanInstall] = useState(!!installEvent);
  const [msg, setMsg] = useState('');
  const platform = PLATFORMS.find((p) => p.id === current) ?? PLATFORMS[0]!;

  useEffect(() => {
    let alive = true;
    void loadRelease().then((r) => {
      if (!alive) return;
      setRelease(r);
      setLoaded(true);
    });
    const onPrompt = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      alive = false;
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  const install = async () => {
    if (!installEvent) {
      setMsg('Открой меню браузера и выбери «Установить приложение» или «Добавить на главный экран».');
      return;
    }
    await installEvent.prompt();
    installEvent = null;
    setCanInstall(false);
  };

  const found = platform.files.map((f) => ({ ...f, asset: release?.assets.find((a) => f.re.test(a.name)) }));
  const anyFound = found.some((f) => f.asset);

  return (
    <div className="screen download" data-testid="download">
      <SelectHead eyebrow="Установка" title="Скачать игру" />
      <p className="download__lead">Играй без браузера: игра ставится как обычное приложение и работает без интернета.</p>

      <div className="download__tabs" role="tablist" aria-label="Устройство">
        {PLATFORMS.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === current} className="download__tab" data-testid={`dl-tab-${p.id}`} onClick={() => setCurrent(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <section className="panel download__panel" role="tabpanel" data-testid="dl-panel">
        {platform.id === 'ios' ? (
          <>
            <p>
              <b>На iPhone и iPad ставится прямо из браузера</b>, нативной сборки нет.
            </p>
            <ol className="download__steps">
              <li>Открой игру в Safari.</li>
              <li>Нажми «Поделиться» (квадрат со стрелкой).</li>
              <li>Выбери «На экран „Домой“».</li>
            </ol>
          </>
        ) : (
          <>
            <div className="download__buttons">
              {found.map((f) =>
                f.asset ? (
                  <a key={f.label} className="btn btn--primary download__btn" href={f.asset.browser_download_url} data-testid="dl-file">
                    <Icon name="upgrade" size={18} />
                    <span>
                      {f.label}
                      <small>{f.hint}</small>
                    </span>
                  </a>
                ) : null,
              )}
              {!anyFound ? (
                <a className="btn btn--primary download__btn" href={RELEASES_URL} target="_blank" rel="noreferrer" data-testid="dl-releases">
                  <Icon name="upgrade" size={18} />
                  <span>
                    {loaded ? 'Открыть страницу релизов' : 'Загрузка…'}
                    <small>выбери файл для своей системы</small>
                  </span>
                </a>
              ) : null}
            </div>
            {release?.tag ? <p className="muted small">Версия {release.tag}</p> : null}
          </>
        )}
        {platform.note ? <p className="download__note">{platform.note}</p> : null}
      </section>

      <section className="panel download__panel">
        <h2 className="section-title">Или прямо из браузера</h2>
        <p className="muted">Любое устройство: установи игру как приложение (PWA), она появится на рабочем столе и будет работать офлайн.</p>
        <button className="btn btn--ghost" data-testid="dl-pwa" onClick={() => void install()}>
          <Icon name="play" size={18} /> {canInstall ? 'Установить как приложение' : 'Как установить из браузера'}
        </button>
        {msg ? <p className="download__note">{msg}</p> : null}
      </section>

      <button className="btn btn--ghost" onClick={() => setView('menu')}>
        Назад
      </button>
    </div>
  );
}
