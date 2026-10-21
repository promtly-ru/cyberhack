/**
 * Экран «Как играть»: правила и словарь терминов.
 * Названия и описания узлов, статусов, классов и уровней сложности берутся из движка и экранов игры,
 * чтобы справочник не расходился с тем, что игрок видит в бою.
 */
import type { ReactNode } from 'react';
import type { ClassDef, MapNodeKind } from '../game/engine';
import { FIRMWARES, MUTATORS, WEEKLY_ATTEMPTS, WEEKLY_RULES, getAscensionDescriptions, listClasses, tryRelicDef, unlockSource } from '../game/engine';
import { MAX_ASCENSION, useGame } from '../game/store';
import { Icon, hasIcon, type IconName } from '../components/Icon';
import { TYPE_LABEL } from '../components/Card';
import { allTerms, type GlossaryTerm } from '../components/glossary';
import { NODE_LABEL } from '../screens/MapScreen';
import { SelectHead } from '../screens/MenuScreens';
import { sfx } from '../audio/sfx';
import { isReducedMotion } from '../ui/settings';
import { startTutorial } from './Tutorial';

const SECTIONS = [
  { id: 'goal', title: 'Цель игры' },
  { id: 'combat', title: 'Как устроен бой' },
  { id: 'cards', title: 'Типы карт' },
  { id: 'map', title: 'Карта сети' },
  { id: 'firmware', title: 'Прошивки и синергии' },
  { id: 'items', title: 'Расходники и ключевые слова' },
  { id: 'heat', title: 'Режим «Перегрев»' },
  { id: 'ascension', title: 'Сложность' },
  { id: 'terms', title: 'Термины' },
  { id: 'classes', title: 'Классы' },
] as const;

/** Группы общего словаря игры (components/glossary.ts): те же формулировки, что в подсказках карт. */
const TERM_GROUPS: { id: GlossaryTerm['group']; title: string }[] = [
  { id: 'basic', title: 'Основное' },
  { id: 'card', title: 'Слова на картах' },
  { id: 'status', title: 'Статусы' },
];

/** Чего нет в словаре карт, но новичок встретит на экранах забега. */
const EXTRA_TERMS = [
  { name: 'Импланты', desc: 'Пассивные бонусы на весь забег. Стартовый имплант есть у каждого класса, новые дают элиты, тайники и Чёрный рынок.' },
  { name: 'Кредиты', desc: 'Деньги забега. Даются за победы, тратятся на Чёрном рынке.' },
];

const NODE_KINDS: MapNodeKind[] = ['combat', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'];

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="panel howto__section" id={`howto-${id}`} aria-labelledby={`howto-${id}-title`}>
      <h2 className="section-title" id={`howto-${id}-title`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ icon, title, children, tone }: { icon: IconName; title: string; children: ReactNode; tone?: string }) {
  return (
    <li className={`howto-row${tone ? ` tone-${tone}` : ''}`}>
      <span className="howto-row__icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="howto-row__body">
        <b>{title}</b>
        <span>{children}</span>
      </span>
    </li>
  );
}

function jump(id: string) {
  document.getElementById(`howto-${id}`)?.scrollIntoView({ block: 'start', behavior: isReducedMotion() ? 'auto' : 'smooth' });
}

export function HowToPlay() {
  const toMenu = useGame((s) => s.toMenu);
  const profile = useGame((s) => s.profile);
  const terms = safe<GlossaryTerm[]>(() => allTerms(), []);
  const classes = safe<ClassDef[]>(() => listClasses(), []);
  const asc = safe(() => getAscensionDescriptions(), [] as { level: number; description: string }[]);

  const back = () => {
    sfx('click');
    toMenu();
  };

  return (
    <div className="screen howto" data-testid="howto">
      <SelectHead eyebrow="Справочник" title="Как играть" />

      <nav className="howto__toc" aria-label="Разделы">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#howto-${s.id}`}
            className="howto__chip"
            onClick={(e) => {
              e.preventDefault();
              jump(s.id);
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="howto__grid">
        <Section id="goal" title="Цель игры">
          <p className="howto__lead">
            Ты — хакер, который пробивается через четыре акта корпоративной сети. Иди по карте снизу вверх, побеждай защитные программы, собирай карты и импланты и сломай финального стража каждого акта.
          </p>
          <p className="muted">Каждый забег начинается заново: другая карта, другие награды. HP упало до нуля — забег окончен, но открытые карты, импланты и классы остаются.</p>
        </Section>

        <Section id="combat" title="Как устроен бой">
          <ul className="howto-list">
            <Row icon="energy" title="Энергия" tone="acid">
              Шар слева снизу. Обычно 3 на ход; каждая карта стоит энергию — цифра в её левом верхнем углу. В начале хода энергия восстанавливается.
            </Row>
            <Row icon="deck" title="Карты" tone="cyan">
              В начале хода берёшь 5 карт из стопки добора. Нажми на карту, затем на цель (атаки) или на карту ещё раз (остальные). Можно и перетащить.
            </Row>
            <Row icon="block" title="Блок" tone="cyan">
              Поглощает урон вместо HP. Твой блок обнуляется в начале следующего хода, так что ставь его, когда враг собирается бить.
            </Row>
            <Row icon="attack" title="Намерения врагов" tone="red">
              Значок над врагом — что он сделает в свой ход: ударит (с цифрой урона), защитится, усилится или наложит дебафф. Наведи или нажми — будет подсказка.
            </Row>
            <Row icon="status" title="Несколько врагов" tone="red">
              Некоторые враги призывают помощников (число врагов в бою ограничено). Убитый враг сразу исчезает, и место освобождается. Бой выигран, когда убиты все.
            </Row>
            <Row icon="play" title="Конец хода" tone="magenta">
              Кнопка «Конец хода» (или клавиша E). Если энергия ещё осталась, игра переспросит. Несыгранные карты уходят в сброс, затем ходят враги. Кончилась стопка добора — сброс перемешивается в новую.
            </Row>
          </ul>
        </Section>

        <Section id="cards" title="Типы карт">
          <ul className="howto-list">
            <Row icon="attack" title={TYPE_LABEL.attack} tone="magenta">
              Наносит урон. Обычно нужно выбрать цель.
            </Row>
            <Row icon="block" title={TYPE_LABEL.skill} tone="cyan">
              Всё остальное: блок, добор, дебаффы, энергия.
            </Row>
            <Row icon="buff" title={TYPE_LABEL.power} tone="acid">
              Играется один раз за бой: карта уходит из боя, а её эффект действует до конца боя.
            </Row>
            <Row icon="status" title={`${TYPE_LABEL.status} и ${TYPE_LABEL.curse.toLowerCase()}`} tone="dim">
              Мусор, который подкидывают враги и события. Обычно неиграбелен и только занимает место в руке.
            </Row>
          </ul>
          <p className="muted small">
            Подпись на карте — её категория: <b>Атака</b> (урон), <b>Защита</b> (блок), <b>Ослабление</b> (дебаффы врагам), <b>Усиление</b> (баффы тебе), <b>Ресурс</b> (добор, энергия, лечение), <b>Модуль</b>. У каждой свой цвет рамки. Если описание длинное, шрифт на карте уменьшается; полный текст виден при удержании.
          </p>
          <p className="muted small">Карты можно улучшать в безопасном узле: у улучшенной в названии «+», цифры сильнее.</p>
        </Section>

        <Section id="map" title="Карта сети">
          <p className="muted small">Двигаться можно только по линиям вверх. Пульсирующие узлы — куда можно пойти сейчас. У каждой зоны своё правило, оно написано на карте: в 1-й зоне его нет, во 2-й каждый 3-й ход враги получают Разгон, в 3-й третья одинаковая атака подряд бьёт вполсилы, в 4-й часть намерений скрыта.</p>
          <ul className="howto-list howto-list--nodes">
            {NODE_KINDS.map((k) => (
              <li key={k} className={`howto-row kind-${k}`}>
                <span className="howto-row__icon howto-row__icon--node" aria-hidden="true">
                  <Icon name={k} size={20} />
                </span>
                <span className="howto-row__body">
                  <b>{NODE_LABEL[k].name}</b>
                  <span>{NODE_LABEL[k].text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="firmware" title="Прошивки и синергии">
          <p>
            <b>Прошивка</b> ⚡ — редкий модуль: выпадает с элитных врагов и боссов, иногда с обычных боёв. Она работает, только если в колоде есть все её особые карты (у каждой прошивки их три). Наведи на прошивку вверху экрана: там список нужных карт (✓ есть, ✗ нет). Две карты из трёх — прошивка работает вполсилы (числа вдвое меньше, без энергии и добора). Все три — полный бонус, и она загорается. Бонус срабатывает в начале боя, в начале или в конце хода. Всего в игре {FIRMWARES.length} прошивок: у каждого класса свои и есть общие.
          </p>
          <p>
            <b>Синергия</b> ★ — маленький бонус в начале боя, если в колоде лежат две-три определённые карты. Она включается сама, ничего получать не нужно: активные синергии видны под твоим персонажем в бою.
          </p>
          <p className="muted small">
            Улучшение карты на костре: тебе предлагают 3 случайные карты из колоды, и улучшить можно только одну из них. Выбирай тщательнее.
          </p>
        </Section>

        <Section id="items" title="Расходники и ключевые слова">
          <p>
            <b>Расходники (модули-инъекции)</b> лежат в трёх слотах вверху экрана. Выпадают с боёв и элит, продаются на рынке. Нажми на слот: «Выпить» применит эффект (в бою, у врага-цели нужно выбрать цель), «Выбросить» освободит слот. Вне боя можно пить только лечебные. Береги их для тяжёлых боёв.
          </p>
          <p>
            <b>Ключевые слова карт.</b> <i>Удержание</i>: карта остаётся в руке в конце хода. <i>Врождённая</i>: всегда в стартовой руке боя. <i>Исчезает</i>: после розыгрыша уходит из боя. <i>Эфемерная</i>: пропадает, если не сыграна за ход. Наведи на карту, чтобы увидеть пояснение.
          </p>
          <p>
            <b>Ещё статусы.</b> <i>Эхо</i>: следующая карта сработает дважды. <i>Барьер</i>: поглощает один пробивший блок удар. <i>Утечка</i>: теряешь HP в начале хода, пока не получишь блок. <i>Метка</i>: цель получает больше урона от ударов.
          </p>
          <p>
            <b>Мутаторы забега.</b> Перед стартом можно включить усложнения или рискованные бонусы: каждый меняет правила и добавляет к счёту. Их можно сочетать.
          </p>
          <dl className="howto-terms">
            {MUTATORS.map((m) => (
              <div key={m.id} className="howto-term">
                <dt>{m.name}</dt>
                <dd>{m.description}</dd>
              </div>
            ))}
          </dl>
          <p>
            <b>Еженедельный вызов.</b> Одна и та же неделя для всех: общий сид, два мутатора и особое правило недели, на всё {WEEKLY_ATTEMPTS} попытки. Правила недели:
          </p>
          <dl className="howto-terms">
            {WEEKLY_RULES.map((m) => (
              <div key={m.id} className="howto-term">
                <dt>{m.name}</dt>
                <dd>{m.description}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="heat" title="Режим «Перегрев»">
          <p>
            Отдельный режим забега (плитка «Перегрев» в меню). Суть: греться и вовремя сливать жар. В бою появляется шкала Heat от 0 до 100: она растёт на 4 за каждую сыгранную карту и на 6 в начале хода, а между боями сбрасывается до 20. На 25 — «Разогрев» (+25% урона), на 50 — «Форсаж» (+1 карта в начале хода), на 75 — «Критическая масса» (первая карта хода бесплатна, +50% урона), но враги на 50 и 75 бьют сильнее (+20% и +40%). На 100 — «Расплавление»: взрыв по всем врагам (Heat × 0,3), ты теряешь 15% макс HP, и Heat падает до 40. Кнопка «Слив ядра» (от 50 Heat, раз в ход, HP не стоит): урон всем врагам Heat × 0,4 (при 90 это 36 каждому; блок врагов работает), Heat падает до 15. Сливай до расплавления. Охладиться можно кнопкой «Охладить» (−30 Heat, −6 HP, раз в ход) или пропустив ход без карт (−15 Heat). Очки в этом режиме ×1.15.
          </p>
        </Section>

        <Section id="ascension" title="Сложность (Ascension)">
          <p>
            Перед забегом выбираешь сложность: <b>Лёгкая</b> (враги слабее, награды щедрее), <b>Обычная</b> или <b>Сложная</b> (враги крепче, золота меньше). Поверх него идут уровни Ascension.
          </p>
          <p>
            Победа открывает следующий уровень для этого класса, до A{MAX_ASCENSION}. Каждый уровень добавляет одно усложнение, и они складываются. Уровень выбирается перед стартом.
          </p>
          {asc.length ? (
            <details className="howto-asc">
              <summary>Все уровни</summary>
              <ol>
                {asc.map((r) => (
                  <li key={r.level}>
                    <span className="mono">A{r.level}</span> {r.description}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </Section>

        <Section id="terms" title="Термины">
          {TERM_GROUPS.map((g) => {
            const list = terms.filter((t) => t.group === g.id);
            const extra = g.id === 'basic' ? EXTRA_TERMS : [];
            if (!list.length && !extra.length) return null;
            return (
              <div key={g.id} className="howto-terms-group">
                <h3 className="howto-terms-group__title">{g.title}</h3>
                <dl className="howto-terms">
                  {list.map((t) => (
                    <div key={t.id} className={`howto-term${t.tone ? ` is-${t.tone}` : ''}`}>
                      <dt>
                        {t.icon && hasIcon(t.icon) ? <Icon name={t.icon as IconName} size={16} /> : null}
                        {t.name}
                        {t.tone ? <span className="howto-term__kind">{t.tone === 'buff' ? 'бафф' : 'дебафф'}</span> : null}
                      </dt>
                      <dd>{t.desc}</dd>
                    </div>
                  ))}
                  {extra.map((t) => (
                    <div key={t.name} className="howto-term">
                      <dt>{t.name}</dt>
                      <dd>{t.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </Section>

        <Section id="classes" title="Классы">
          <ul className="howto-classes">
            {classes.map((c) => {
              const locked = !profile.unlockedClasses.includes(c.id);
              const how = locked ? unlockSource('class', c.id) : null;
              const relic = tryRelicDef(c.startingRelic);
              return (
                <li key={c.id} className={`howto-class${locked ? ' is-locked' : ''}`}>
                  <b className="howto-class__name">
                    {c.name}
                    {locked ? <Icon name="lock" size={14} /> : null}
                  </b>
                  <span>{c.description}</span>
                  <span className="howto-class__meta mono">
                    <span>
                      <Icon name="hp" size={14} /> {c.maxHp} HP
                    </span>
                    <span>
                      <Icon name="gold" size={14} /> {c.startingGold}
                    </span>
                  </span>
                  {relic ? (
                    <span className="muted small">
                      Имплант «{relic.name}»: {relic.description}
                    </span>
                  ) : null}
                  {how ? <span className="muted small">Как открыть: {how.description}</span> : null}
                </li>
              );
            })}
          </ul>
        </Section>

      </div>

      <div className="howto__foot">
        <button className="btn btn--ghost" data-testid="howto-back" onClick={back}>
          <Icon name="back" size={18} /> Назад
        </button>
        <button
          className="btn btn--primary"
          data-testid="howto-tutorial"
          onClick={() => {
            sfx('select');
            startTutorial();
          }}
        >
          <Icon name="graduation" size={18} /> Пройти обучение
        </button>
      </div>
    </div>
  );
}
