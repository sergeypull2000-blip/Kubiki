import { useState } from 'react'
import { Logo } from '../Logo.jsx'
import './landing.css'

const signupHref = '/signup'

function Cta({ className = '' }) {
  return <a className={`lp-cta ${className}`.trim()} href={signupHref}>Попробовать Kubiki</a>
}

export function LandingPage() {
  const [screenshotAvailable, setScreenshotAvailable] = useState(true)

  return (
    <div className="lp-page">
      <header className="lp-header">
        <a className="lp-brand" href="/" aria-label="Kubiki — главная"><Logo size={24} /><span>Kubiki</span></a>
        <nav className="lp-nav" aria-label="Навигация по странице">
          <a href="#how">Как это работает</a>
          <a href="#memory">Память студии</a>
          <a href="#ai-edit">Kubiki AI</a>
          <a href="/login">Войти</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero lp-container" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Сметы для CG-студий</p>
            <h1 id="hero-title">Загрузите бриф.<br />Kubiki AI соберёт смету за Вас.</h1>
            <p className="lp-lead">Kubiki AI разбирает клиентский бриф, собирает этапы и задачи, добавляет исполнителей и рассчитывает первую версию сметы с учётом шаблонов, прошлых проектов и ставок именно Вашей студии.</p>
            <div className="lp-hero-action"><Cta /><small>Закрытая beta · Бесплатно для Вашей студии</small></div>
          </div>
          <figure className="lp-product-shot">
            {screenshotAvailable && <img src="/kubiki-workspace-hero-4x.png" alt="Актуальный интерфейс Kubiki со сметой" fetchPriority="high" onError={() => setScreenshotAvailable(false)} />}
            {!screenshotAvailable && <div className="lp-product-placeholder"><Logo size={32} /><strong>Актуальный интерфейс Kubiki</strong><span>Добавьте screenshot в<br /><code>public/kubiki-product-screenshot.webp</code></span></div>}
            <figcaption>{screenshotAvailable ? 'Актуальный интерфейс Kubiki' : 'Место подготовлено для настоящего product screenshot'}</figcaption>
          </figure>
        </section>

        <section className="lp-section lp-container" id="how" aria-labelledby="how-title">
          <div className="lp-how-heading"><p className="lp-kicker">Как это работает</p><h2 id="how-title">От клиентского брифа до готовой сметы</h2></div>
          <div className="lp-workflow" aria-label="Бриф клиента, первая версия сметы, корректировки, готово">
            <div className="lp-workflow-track" aria-hidden="true"><span className="is-active" /><span /><span /><span className="is-done" /></div>
            <div className="lp-workflow-stages">
              <div><strong>Бриф клиента</strong><small>Опишите задачу или импортируйте файл</small></div>
              <div><strong>Kubiki AI собирает смету</strong><small>Разбирает проект на этапы и задачи, добавляет исполнителей и рассчитывает стоимость</small></div>
              <div><strong>Корректировки</strong><small>Вручную или через Kubiki AI</small></div>
              <div><strong>Готово</strong><small>Проверяете результат и отправляете смету клиенту</small></div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-container" id="features" aria-labelledby="compare-title">
          <div className="lp-section-heading lp-process-heading"><p className="lp-kicker">Рабочий процесс</p><h2 id="compare-title">Kubiki берёт на себя рутину<br />между брифом и сметой</h2></div>
          <div className="lp-compare">
            <article><h3>Обычно</h3><p>Бриф <i>→</i> анализ брифа <i>→</i> сверка с прошлыми проектами <i>→</i> поиск подходящей сметы <i>→</i> копирование <i>→</i> сверка ставок <i>→</i> правки <i>→</i> ручной пересчёт <i>→</i> проверка формул <i>→</i> ещё правки</p></article>
            <article className="is-kubiki"><h3>С Kubiki</h3><p>Бриф <i>→</i> первая версия сметы <i>→</i> корректировки <i>→</i> готово</p></article>
          </div>
        </section>

        <section className="lp-section lp-memory" id="memory" aria-labelledby="memory-title">
          <div className="lp-container lp-memory-grid">
            <div><p className="lp-kicker">Память студии</p><h2 id="memory-title">AI, которому не нужно<br />каждый раз объяснять<br />всё с нуля</h2><p className="lp-body-large">Kubiki может хранить шаблоны, прошлые проекты, исполнителей, ставки и правила Вашей студии.</p><p>Kubiki AI использует релевантный контекст при подготовке новых смет — поэтому работает не только с текущим брифом, но и с накопленными знаниями Вашей команды.</p></div>
            <div className="lp-memory-diagram" aria-label="Источники памяти студии сходятся в Kubiki">
              <svg className="lp-memory-connections" viewBox="0 0 600 310" preserveAspectRatio="none" aria-hidden="true">
                <path d="M78 48 L300 155 M300 48 L300 155 M522 48 L300 155 M78 155 L300 155 M522 155 L300 155 M78 262 L300 155 M410 262 L300 155" />
              </svg>
              <span className="lp-memory-source is-projects">Прошлые проекты</span>
              <span className="lp-memory-source is-templates">Шаблоны</span>
              <span className="lp-memory-source is-performers">Исполнители</span>
              <span className="lp-memory-source is-payments">Типы оплаты</span>
              <div className="lp-memory-core"><Logo size={28} /><strong>Kubiki AI</strong><small>Контекст студии</small></div>
              <span className="lp-memory-source is-rates">Ставки</span>
              <span className="lp-memory-source is-rules">Правила генерации</span>
              <span className="lp-memory-source is-personalization">Персонализация</span>
            </div>
          </div>
        </section>

        <section className="lp-section lp-container" id="features" aria-labelledby="compare-title">
          <div className="lp-section-heading lp-process-heading"><p className="lp-kicker">Рабочий процесс</p><h2 id="compare-title">Kubiki берёт на себя рутину<br />между брифом и сметой</h2></div>
          <div className="lp-compare">
            <article><h3>Обычно</h3><p>Бриф <i>→</i> анализ брифа <i>→</i> сверка с прошлыми проектами <i>→</i> поиск подходящей сметы <i>→</i> копирование <i>→</i> сверка ставок <i>→</i> правки <i>→</i> ручной пересчёт <i>→</i> проверка формул <i>→</i> ещё правки</p></article>
            <article className="is-kubiki"><h3>С Kubiki</h3><p>Бриф <i>→</i> первая версия сметы <i>→</i> корректировки <i>→</i> готово</p></article>
          </div>
        </section>

        <section className="lp-section lp-container lp-product-proof" aria-labelledby="product-proof-title">
          <div className="lp-product-proof-copy"><p className="lp-kicker">ПЕРЕИСПОЛЬЗОВАНИЕ</p><h2 id="product-proof-title">ПРОЕКТЫ И ШАБЛОНЫ</h2><p>Сохраняйте готовые сметы как шаблоны и используйте прошлые проекты как основу для новых. Не нужно каждый раз собирать структуру и расчёты с нуля.</p></div>
          <figure><img src="/kubiki-workspace-screenshot.webp" alt="Рабочее пространство Kubiki с проектами, шаблонами и сметами" /><figcaption>Рабочая среда Kubiki</figcaption></figure>
        </section>

        <section className="lp-section lp-container lp-knowledge" aria-labelledby="knowledge-title">
          <div><p className="lp-kicker">Опыт команды</p><h2 id="knowledge-title">Знания не должны жить в голове одного продюсера</h2><p>Kubiki сохраняет информацию об исполнителях, ставках, рабочих правилах студии, типовых проектах, этапах и задачах, чтобы всё нужное всегда было под рукой.</p></div>
          <div><figure className="lp-knowledge-shot"><div className="lp-knowledge-images"><img className="is-primary" src="/kubiki-personalization.png" alt="Персонализация и правила студии в Kubiki" /><img className="is-supporting" src="/kubiki-quick-access.png" alt="Быстрый доступ с исполнителями и ставками в Kubiki" /></div><figcaption>Правила студии, исполнители и ставки в Kubiki</figcaption></figure></div>
        </section>

        <section className="lp-section lp-container lp-small-features" aria-label="Возможности Kubiki">
          <article id="ai-edit">
            <p className="lp-kicker">KUBIKI AI</p><h2>AI-агент, который работает прямо внутри сметы</h2><p>Kubiki AI не просто отвечает на вопросы в чате. Он работает с самой сметой: может добавлять этапы, задачи и исполнителей, менять параметры проекта и пересчитывать результат.</p><p>Вы просто описываете, что нужно изменить.</p>
            <ul className="lp-commands"><li>«Добавь этап препродакшна»</li><li>«Увеличь сроки композа»</li><li>«Добавь арт-директора»</li><li>«Пересчитай эту часть проекта»</li></ul>
          </article>
            <article id="import">
            <p className="lp-kicker">Импорт</p><h2>Импортируйте готовые сметы</h2><p>Если у студии уже есть готовые сметы, их можно импортировать в Kubiki, доработать и сохранить как шаблоны студии.</p>
          </article>
        </section>

        <section className="lp-section lp-container lp-export-finale" aria-labelledby="export-finale-title">
          <div className="lp-export-finale-copy">
            <p className="lp-kicker">ГОТОВАЯ СМЕТА</p>
            <h2 id="export-finale-title">Собрали. Проверили. Отправили клиенту.</h2>
            <p>Настройте оформление сметы под Вашу студию и экспортируйте готовый результат для отправки клиенту.</p>
          </div>
          <figure className="lp-export-finale-shot">
            <img src="/kubiki-export-settings.png" alt="Предпросмотр готовой сметы и настройки экспорта в Kubiki" loading="lazy" />
            <figcaption>Готовая смета и настройка экспорта в Kubiki</figcaption>
          </figure>
        </section>

        <section className="lp-final lp-beta-note" aria-labelledby="beta-note-title">
          <p className="lp-kicker">ЗАКРЫТАЯ BETA</p><h2 id="beta-note-title">Помогите сделать Kubiki удобнее для Вашей студии</h2>
          <p className="lp-beta-note-copy">Мы хотим строить Kubiki вместе с теми, кто будет пользоваться им каждый день. Расскажите, что важно именно Вашей студии — и мы обязательно учтём это при разработке.</p>
          <Cta /><small>Бесплатно для Вашей студии</small>
        </section>
      </main>

      <footer className="lp-footer lp-container"><span>© Kubiki</span><div><a href="/privacy">Политика конфиденциальности</a><a href="/terms">Условия использования</a></div></footer>
    </div>
  )
}
