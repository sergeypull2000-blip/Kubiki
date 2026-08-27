import { Logo } from '../Logo.jsx'
import productScreenshot from '../../local-ai-dialog-preview.png'
import './landing.css'

const signupHref = '/signup'

function Cta({ className = '' }) {
  return <a className={`lp-cta ${className}`.trim()} href={signupHref}>Попробовать Kubiki</a>
}

export function LandingPage() {
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
            <p className="lp-lead">Собирайте сметы из клиентских брифов с учётом шаблонов, прошлых проектов, исполнителей и правил именно вашей студии.</p>
            <div className="lp-hero-action"><Cta /><small>Закрытая beta · Бесплатно для вашей студии</small></div>
          </div>
          <figure className="lp-product-shot">
            <img src={productScreenshot} width="1280" height="800" alt="Рабочее пространство Kubiki со сметой и встроенным AI Edit" fetchPriority="high" />
            <figcaption>Настоящий интерфейс Kubiki</figcaption>
          </figure>
        </section>

        <section className="lp-section lp-container" id="how" aria-labelledby="how-title">
          <div className="lp-section-heading"><p className="lp-kicker">От брифа к рабочей смете</p><h2 id="how-title">Как это работает</h2></div>
          <div className="lp-steps">
            <article><span>01</span><h3>Дайте Kubiki бриф</h3><p>Опишите задачу своими словами или импортируйте бриф клиента.</p></article>
            <article><span>02</span><h3>Получите первую версию сметы</h3><p>Kubiki поможет разложить проект на этапы, задачи и работы и собрать первую версию сметы.</p></article>
            <article><span>03</span><h3>Доработайте под себя</h3><p>Меняйте смету вручную или через встроенного ИИ-агента.</p></article>
          </div>
          <div className="lp-centered-action"><Cta /></div>
        </section>

        <section className="lp-section lp-memory" id="memory" aria-labelledby="memory-title">
          <div className="lp-container lp-memory-grid">
            <div><p className="lp-kicker">Память студии</p><h2 id="memory-title">Kubiki знает, как считает именно ваша студия</h2><p className="lp-body-large">Kubiki может учитывать релевантные шаблоны, историю прошлых проектов и исполнителей вашей студии при подготовке следующих смет.</p><p>Чем больше вы работаете в Kubiki, тем меньше приходится каждый раз объяснять одно и то же с нуля.</p></div>
            <div className="lp-memory-list" aria-label="Контекст студии">
              {['Прошлые проекты', 'Шаблоны', 'Исполнители', 'Ставки', 'Типы оплаты', 'Правила генерации', 'Персонализация'].map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
        </section>

        <section className="lp-section lp-container" id="features" aria-labelledby="compare-title">
          <div className="lp-section-heading"><p className="lp-kicker">Рабочий процесс</p><h2 id="compare-title">Сметы быстрее. Ошибок меньше. Контроля больше.</h2></div>
          <div className="lp-compare">
            <article><h3>Обычно</h3><p>Бриф <i>→</i> поиск старой сметы <i>→</i> копирование <i>→</i> сверка ставок <i>→</i> правки <i>→</i> ещё правки</p></article>
            <article className="is-kubiki"><h3>С Kubiki</h3><p>Бриф <i>→</i> первая версия сметы <i>→</i> корректировки <i>→</i> готово</p></article>
          </div>
        </section>

        <section className="lp-section lp-container lp-knowledge" aria-labelledby="knowledge-title">
          <div><p className="lp-kicker">Опыт команды</p><h2 id="knowledge-title">Знания не должны жить в голове одного продюсера</h2></div>
          <div><p>Если человек уходит из студии, вместе с ним не должны исчезать правила расчёта, рабочие шаблоны и понимание того, как принято считать проекты.</p><p>Kubiki помогает сохранять эту систему внутри студии, чтобы новым коллегам было проще включаться в работу, а опытным продюсерам не приходилось постоянно повторять одни и те же объяснения.</p></div>
        </section>

        <section className="lp-section lp-container lp-small-features" aria-label="Возможности Kubiki">
          <article>
            <p className="lp-kicker">AI Edit</p><h2>Дорабатывайте смету через встроенного ИИ-агента</h2><p>Получите структуру проекта, а затем обычным языком попросите Kubiki изменить её.</p>
            <ul className="lp-commands"><li>«Добавь этап препродакшна»</li><li>«Увеличь сроки композа»</li><li>«Добавь арт-директора»</li><li>«Пересчитай эту часть проекта»</li></ul>
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
