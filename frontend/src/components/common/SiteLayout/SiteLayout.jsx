import { t as uiText } from "../../../i18n/index.js";
import { useTranslation } from 'react-i18next';
/** Shared navigation and reading layout for public pages and account workspaces. */
import { useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { getAccessToken } from '../../../utils/authSession';
import classes from './SiteLayout.module.css';
import LanguageSelect from '../LanguageSelect/LanguageSelect';

/** Public and workspace menus share order, active indicators, and the primary start action. */
export function SiteHeader({ workspace = false, showLanguageSelect = false }) {
  useTranslation();
  const signedIn = Boolean(getAccessToken());
  return <header className={classes.header}>
    <Link to="/" className={classes.brand} aria-label={uiText("public:siteLayout.cvStudioHomepage")}><img src="/cv-studio-logo.svg" alt="" /></Link>
    <nav aria-label={uiText("public:siteLayout.mainNavigation")} className={classes.nav}>
      {workspace ? <><NavLink to="/app/documents">{uiText("public:siteLayout.myDocuments")}</NavLink><NavLink to="/app/career-profile">{uiText("public:siteLayout.careerProfile")}</NavLink><NavLink to="/app/account">{uiText("interview:interviewFlow.accountAndPlan")}</NavLink></> : <><NavLink to="/templates">{uiText("public:siteLayout.templates")}</NavLink><NavLink to="/pricing">{uiText("public:siteLayout.pricing")}</NavLink></>}
      <NavLink to="/help">{uiText("public:siteLayout.help")}</NavLink>
      {!workspace && <Link to={signedIn ? '/app/documents' : '/login'}>{signedIn ? uiText("public:siteLayout.myDocuments") : uiText("public:siteLayout.signIn")}</Link>}
      <Link className={classes.primary} to="/app/new">{uiText("public:siteLayout.createCv")}</Link>
      {showLanguageSelect ? <LanguageSelect /> : null}
    </nav>
  </header>;
}

/** Only implemented destinations appear in the shared secondary navigation. */
export function SiteFooter() {
  useTranslation();
  return <footer className={classes.footer}>
    <p>CV Studio <span>{uiText("public:siteLayout.chooseATemplateEnterYourContentAnd")}</span></p>
    <nav aria-label={uiText("public:siteLayout.footer")}><Link to="/templates">{uiText("public:siteLayout.templates")}</Link><Link to="/pricing">{uiText("public:siteLayout.pricing")}</Link><Link to="/help">{uiText("public:siteLayout.help")}</Link><Link to="/privacy">{uiText("public:siteLayout.privacy")}</Link></nav>
  </footer>;
}

/** Route changes reset reading position and focus, while anchors keep native navigation. */
export default function SiteLayout({ title, eyebrow = 'CV STUDIO', intro, workspace = false, breadcrumbs, heroAside, heroActions, compact = false, children }) {
  useTranslation();
  const heading = useRef(null);
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${title} — CV Studio`;
  }, [title]);
  // A translated heading must not be treated as route navigation. The locale
  // selected on the landing page can update while this layout is mounted, so
  // only real path or anchor changes reset reading position and focus.
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      heading.current?.focus({ preventScroll: true });
    } else {
      // Client-side route links mount help content after navigation. Restore
      // the native anchor destination once that content exists, including focus.
      const target = document.getElementById(hash.slice(1));
      target?.scrollIntoView({ behavior: 'instant', block: 'start' });
      target?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);
  return <div className={classes.site}>
    <a className={classes.skip} href="#site-content">{uiText("public:siteLayout.skipToContent")}</a>
    <SiteHeader workspace={workspace} />
    <main id="site-content" tabIndex={-1} className={`${classes.main} ${workspace ? classes.workspace : ''}`}>
      {breadcrumbs && <nav className={classes.breadcrumbs} aria-label={uiText("public:siteLayout.breadcrumbs")}>{breadcrumbs.map((item) => item.to ? <Link key={item.label} to={item.to}>{item.label}</Link> : <span key={item.label} aria-current="page">{item.label}</span>)}</nav>}
      <div className={`${heroAside ? classes.hero : ''} ${compact ? classes.compactHero : ''}`}>
        <div className={classes.introduction}><p className={classes.eyebrow}>{eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{intro && <p>{intro}</p>}{heroActions && <div className={classes.actions}>{heroActions}</div>}</div>
        {heroAside && <aside className={classes.heroAside}>{heroAside}</aside>}
      </div>
      {children}
    </main>
    <SiteFooter />
  </div>;
}
