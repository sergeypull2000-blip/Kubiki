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
          <a href="#features">Возможности</a>
          <a href="#memory">Память студии</a>
          <a href="/login">Войти</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero lp-container" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Сметы для CG-студий</p>
            <h1 id="hero-title">Kubiki — память вашей студии</h1>
            <p className="lp-lead">Собирайте сметы из клиентских брифов с учётом шаблонов, прошлых проектов, исполнителей и правил вашей студии. Kubiki AI объединяет накопленные знания в единую память и использует её в работе.</p>
            <div className="lp-hero-action"><Cta /><small>Закрытая beta · Бесплатно для вашей студии</small></div>
          </div>
          <figure className="lp-product-shot">
            {screenshotAvailable && <img src="/kubiki-product-screenshot.webp" alt="Актуальный интерфейс Kubiki со сметой" fetchPriority="high" onError={() => setScreenshotAvailable(false)} />}
            {!screenshotAvailable && <div className="lp-product-placeholder"><Logo size={32} /><strong>Актуальный интерфейс Kubiki</strong><span>Добавьте screenshot в<br /><code>public/kubiki-product-screenshot.webp</code></span></div>}
            <figcaption>{screenshotAvailable ? 'Актуальный интерфейс Kubiki' : 'Место подготовлено для настоящего product screenshot'}</figcaption>
          </figure>
        </section>

        <section className="lp-section lp-container" id="how" aria-labelledby="how-title">
          <div className="lp-how-heading"><p className="lp-kicker">Как это работает</p><h2 id="how-title">От брифа до рабочей сметы</h2></div>
          <div className="lp-workflow" aria-label="Бриф клиента, первая версия сметы, корректировки, готово">
            <div className="lp-workflow-track" aria-hidden="true"><span className="is-active" /><span /><span /><span className="is-done" /></div>
            <div className="lp-workflow-stages">
              <div><strong>Бриф клиента</strong><small>Опишите задачу или импортируйте файл</small></div>
              <div><strong>Первая версия сметы</strong><small>Kubiki AI собирает структуру проекта</small></div>
              <div><strong>Корректировки</strong><small>Вручную или через Kubiki AI</small></div>
              <div><strong>Готово</strong><small>Проверяете и используете смету</small></div>
            </div>
            <p className="lp-workflow-principle"><span>Вы задаёте проект</span><i>→</i><span>Kubiki собирает основу</span><i>→</i><strong>Вы доводите её до готовой сметы</strong></p>
          </div>
        </section>

        <section className="lp-section lp-memory" id="memory" aria-labelledby="memory-title">
          <div className="lp-container lp-memory-grid">
            <div><p className="lp-kicker">Память студии</p><h2 id="memory-title">Kubiki знает, как считает именно ваша студия</h2><p className="lp-body-large">Kubiki AI может учитывать релевантные шаблоны, историю прошлых проектов и исполнителей вашей студии при подготовке следующих смет.</p><p>Чем больше вы работаете в Kubiki, тем меньше приходится каждый раз объяснять одно и то же с нуля.</p></div>
            <div className="lp-memory-diagram" aria-label="Источники памяти студии сходятся в Kubiki">
              <svg className="lp-memory-connections" viewBox="0 0 600 310" preserveAspectRatio="none" aria-hidden="true">
                <path d="M78 48 L300 155 M300 48 L300 155 M522 48 L300 155 M78 155 L300 155 M522 155 L300 155 M78 262 L300 155 M410 262 L300 155" />
              </svg>
              <span className="lp-memory-source is-projects">Прошлые проекты</span>
              <span className="lp-memory-source is-templates">Шаблоны</span>
              <span className="lp-memory-source is-performers">Исполнители</span>
              <span className="lp-memory-source is-payments">Типы оплаты</span>
              <div className="lp-memory-core"><Logo size={28} /><strong>Kubiki</strong><small>Контекст студии</small></div>
              <span className="lp-memory-source is-rates">Ставки</span>
              <span className="lp-memory-source is-rules">Правила генерации</span>
              <span className="lp-memory-source is-personalization">Персонализация</span>
            </div>
          </div>
        </section>

        <section className="lp-section lp-container" id="features" aria-labelledby="compare-title">
          <div className="lp-section-heading lp-process-heading"><p className="lp-kicker">Рабочий процесс</p><h2 id="compare-title"><span>Сметы быстрее.</span><span>Ошибок меньше.</span><span>Контроля больше.</span></h2></div>
          <div className="lp-compare">
            <article><h3>Обычно</h3><p>Бриф <i>→</i> анализ брифа <i>→</i> сверка с прошлыми проектами <i>→</i> поиск подходящей сметы <i>→</i> копирование <i>→</i> сверка ставок <i>→</i> правки <i>→</i> ручной пересчёт <i>→</i> проверка формул <i>→</i> ещё правки</p></article>
            <article className="is-kubiki"><h3>С Kubiki</h3><p>Бриф <i>→</i> первая версия сметы <i>→</i> корректировки <i>→</i> готово</p></article>
          </div>
        </section>

        <section className="lp-section lp-container lp-knowledge" aria-labelledby="knowledge-title">
          <div><p className="lp-kicker">Опыт команды</p><h2 id="knowledge-title">Знания не должны жить в голове одного продюсера</h2></div>
          <div><p>Если человек уходит из студии, вместе с ним не должны исчезать правила расчёта, рабочие шаблоны и понимание того, как принято считать проекты.</p><p>Kubiki помогает сохранять эту систему внутри студии, чтобы новым коллегам было проще включаться в работу, а опытным продюсерам не приходилось постоянно повторять одни и те же объяснения.</p></div>
        </section>

        <section className="lp-section lp-container lp-small-features" aria-label="Возможности Kubiki">
          <article>
            <p className="lp-kicker">KUBIKI AI</p><h2>Дорабатывайте смету обычным языком</h2><p>Получите структуру проекта, а затем обычным языком попросите Kubiki AI изменить её.</p>
            <ul className="lp-commands"><li>«Добавь этап препродакшна»</li><li>«Увеличь сроки композа»</li><li>«Добавь арт-директора»</li><li>«Пересчитай эту часть проекта»</li></ul>
            <figure className="lp-ai-product-shot"><img src="/ai-edit-product.png" alt="Реальный интерфейс Kubiki со сметой и результатом AI Edit" /><figcaption>Kubiki AI в рабочей смете Kubiki</figcaption></figure>
          </article>
          <article>
            <p className="lp-kicker">Импорт</p><h2>Импортируйте готовые сметы</h2><p>Если у студии уже есть готовые сметы, их можно импортировать в Kubiki, доработать и сохранить как шаблоны студии.</p><p>Сохранённые шаблоны Kubiki сможет учитывать при подготовке следующих смет.</p>
          </article>
        </section>

        <section className="lp-final lp-container" aria-labelledby="final-title">
          <p className="lp-kicker">Закрытая beta</p><h2 id="final-title">Сейчас Kubiki в закрытой beta</h2><p>Ищем CG-студии, которые готовы попробовать Kubiki на реальных проектах и дать обратную связь.</p><Cta /><small>Бесплатно для вашей студии</small>
        </section>
      </main>

      <footer className="lp-footer lp-container"><span>© Kubiki</span><div><a href="/privacy">Политика конфиденциальности</a><a href="/terms">Условия использования</a></div></footer>
    </div>
  )
}
