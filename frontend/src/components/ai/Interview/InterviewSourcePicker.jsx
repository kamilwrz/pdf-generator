import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiFileText } from 'react-icons/fi';
import { t } from '../../../i18n';
import { getEditorPath } from '../../../utils/authSession';
import site from '../../common/SiteLayout/SiteLayout.module.css';
import classes from './InterviewSourcePicker.module.css';

const PAGE_SIZE = 4;

/**
 * Browses eligible sources locally; only choosing a row starts an interview.
 * Each tab retains its own search and page. Server ordering and source IDs are
 * preserved, including documents and imports that happen to share an ID.
 */
export default function InterviewSourcePicker({ documents, imports, disabled, onSelect, languageControl }) {
  useTranslation();
  const id = useId();
  const [tab, setTab] = useState(documents.length ? 'document' : 'import');
  const [views, setViews] = useState({ document: { query: '', page: 0 }, import: { query: '', page: 0 } });
  const tabs = useRef({});
  const search = useRef(null);
  const panel = useRef(null);
  const items = tab === 'document' ? documents : imports;
  const { query, page } = views[tab];
  const title = item => (tab === 'document' ? item.title : item.filename) || t('editor:sectionsPanel.untitled');
  const filtered = items.filter(item => title(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A source refresh can shorten a collection without resetting the user's search.
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const updateView = patch => setViews(previous => ({ ...previous, [tab]: { ...previous[tab], ...patch } }));

  function changePage(next) {
    updateView({ page: next });
    // Keep keyboard users at the new results instead of a now-disabled arrow.
    panel.current?.focus({ preventScroll: true });
  }

  return <div className={classes.sourcePicker}>
    <div className={classes.toolbar}>
      <div className={`${site.tabs} ${classes.sourceTabs}`} role="tablist" aria-label={t('interview:sourcePicker.sources')}>
        {['document', 'import'].map((value, index) => <button key={value} type="button" role="tab"
          className={site.tab} id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`}
          ref={element => { tabs.current[value] = element; }} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'document' : event.key === 'End' ? 'import' : ['document', 'import'][1 - index];
            setTab(next); tabs.current[next]?.focus();
          }}>
          {t(value === 'document' ? 'interview:sourcePicker.documents' : 'interview:sourcePicker.imports')}
          <span className={classes.count}>{value === 'document' ? documents.length : imports.length}</span>
        </button>)}
      </div>
      <label className={classes.search}>{t('interview:sourcePicker.search')}
        <input ref={search} type="search" value={query} onChange={event => updateView({ query: event.target.value, page: 0 })} />
      </label>
      {languageControl}
    </div>
    {['document', 'import'].map(value => <div key={value} role="tabpanel" id={`${id}-panel-${value}`}
      aria-labelledby={`${id}-tab-${value}`} hidden={value !== tab} tabIndex={0} ref={value === tab ? panel : undefined}>
      {value === tab && <>
        <ul className={classes.list}>
          {visible.map(item => <li key={item.id}><button type="button" disabled={disabled} onClick={() => onSelect(`${tab}:${item.id}`)}>
            <FiFileText aria-hidden="true" /><span>{title(item)}</span><FiArrowRight aria-hidden="true" />
          </button></li>)}
        </ul>
        {visible.length === 0 && <div className={classes.empty}>
          <p role="status">{t(items.length ? 'interview:sourcePicker.noMatches' : tab === 'document' ? 'interview:sourcePicker.noDocuments' : 'interview:sourcePicker.noImports')}</p>
          {items.length ? <button type="button" onClick={() => { updateView({ query: '', page: 0 }); search.current?.focus(); }}>{t('documents:documentsPage.clearSearch')}</button>
            : <Link className={site.secondary} to={tab === 'import' ? '/app/import' : getEditorPath({ start: 'new' })}>
              {t(tab === 'import' ? 'editor:topbar.importPdf' : 'interview:interviewFlow.createCvManually')}</Link>}
        </div>}
        <div className={classes.footer}>
          <p className={classes.hint}>{t('interview:sourcePicker.startHint')}</p>
          {filtered.length > 0 && <nav className={classes.pagination} aria-label={t('interview:sourcePicker.pagination')}>
            <span role="status">{t('interview:sourcePicker.page', { page: currentPage + 1, pages })}</span>
            {pages > 1 && <>
              <button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label={t('interview:sourcePicker.previous')}>←</button>
              <button type="button" disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)} aria-label={t('interview:sourcePicker.next')}>→</button>
            </>}
          </nav>}
        </div>
      </>}
    </div>)}
  </div>;
}
