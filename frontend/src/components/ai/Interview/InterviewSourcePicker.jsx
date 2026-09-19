import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiFileText } from 'react-icons/fi';
import { t } from '../../../i18n';
import { validateCvPdf } from '../../../services/cvImport';
import { getEditorPath } from '../../../utils/authSession';
import site from '../../common/SiteLayout/SiteLayout.module.css';
import classes from './InterviewSourcePicker.module.css';

const PAGE_SIZE = 4;

/**
 * Shared CV step for the assistant workflows: one searchable list combines
 * saved CVs and imports, with an optional inline PDF upload. Hosts decide what
 * a row activation means — the improvement flow starts a conversation, the
 * tailoring flow only records a selection (exposed through `selected`), so
 * this component never talks to the network itself. Server ordering and
 * source IDs are preserved, including documents and imports that happen to
 * share a numeric ID.
 */
export default function InterviewSourcePicker({ documents, imports, disabled, onSelect, selected = null, languageControl, hint, onUpload }) {
  useTranslation();
  const id = useId();
  const [view, setView] = useState({ query: '', page: 0 });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const search = useRef(null);
  const list = useRef(null);
  const fileInput = useRef(null);
  // One idempotency key per chosen file: a retry after a transport failure
  // must let the server deduplicate an upload that actually went through.
  const uploadKey = useRef(null);
  const title = item => item.name || t('editor:sectionsPanel.untitled');
  const rows = [
    ...documents.map(item => ({ value: `document:${item.id}`, name: item.title, type: 'typeDocument' })),
    ...imports.map(item => ({ value: `import:${item.id}`, name: item.filename, type: 'typeImport' })),
  ];
  const filtered = rows.filter(item => title(item).toLocaleLowerCase().includes(view.query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A source refresh can shorten the collection without resetting the user's search.
  const currentPage = Math.min(view.page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const fileError = file ? validateCvPdf(file) : null;

  function changePage(next) {
    setView(previous => ({ ...previous, page: next }));
    // Keep keyboard users at the new results instead of a now-disabled arrow.
    list.current?.focus({ preventScroll: true });
  }
  async function upload() {
    setUploading(true);
    try {
      await onUpload(file, uploadKey.current);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    } catch {
      // The host announces the failure. Keep the chosen file mounted so a
      // retry reuses the same idempotency key instead of re-billing extraction.
    } finally { setUploading(false); }
  }

  return <div className={classes.sourcePicker}>
    <div className={classes.toolbar}>
      <label className={classes.search}>{t('interview:sourcePicker.search')}
        <input ref={search} type="search" value={view.query} onChange={event => setView({ query: event.target.value, page: 0 })} />
      </label>
      {languageControl}
    </div>
    <ul ref={list} tabIndex={-1} className={classes.list} aria-label={t('interview:sourcePicker.sources')}>
      {visible.map(item => <li key={item.value}>
        <button type="button" disabled={disabled} aria-describedby={`${id}-${item.value}`}
          aria-pressed={selected === null ? undefined : selected === item.value}
          onClick={() => onSelect(item.value)}>
          <FiFileText aria-hidden="true" /><span>{title(item)}</span><FiArrowRight aria-hidden="true" />
        </button>
        <span id={`${id}-${item.value}`} className={classes.badge}>{t(`interview:sourcePicker.${item.type}`)}</span>
      </li>)}
    </ul>
    {visible.length === 0 && <div className={classes.empty}>
      <p role="status">{t(rows.length ? 'interview:sourcePicker.noMatches' : 'interview:sourcePicker.noSources')}</p>
      {rows.length ? <button type="button" onClick={() => { setView({ query: '', page: 0 }); search.current?.focus(); }}>{t('documents:documentsPage.clearSearch')}</button>
        : <Link className={site.secondary} to={getEditorPath({ start: 'new' })}>{t('interview:interviewFlow.createCvManually')}</Link>}
    </div>}
    <div className={classes.footer}>
      {hint && <p className={classes.hint}>{hint}</p>}
      {filtered.length > 0 && <nav className={classes.pagination} aria-label={t('interview:sourcePicker.pagination')}>
        <span role="status">{t('interview:sourcePicker.page', { page: currentPage + 1, pages })}</span>
        {pages > 1 && <>
          <button type="button" disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)} aria-label={t('interview:sourcePicker.previous')}>←</button>
          <button type="button" disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)} aria-label={t('interview:sourcePicker.next')}>→</button>
        </>}
      </nav>}
    </div>
    {onUpload && <div className={classes.upload}>
      <label>{t('interview:sourcePicker.file')}
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" disabled={disabled || uploading}
          onChange={event => { setFile(event.target.files?.[0] || null); uploadKey.current = crypto.randomUUID(); }} />
      </label>
      {file && !fileError && <button type="button" className={site.secondary} disabled={disabled || uploading} onClick={upload}>{t('interview:sourcePicker.upload')}</button>}
      {fileError && <p role="alert">{t(fileError)}</p>}
    </div>}
  </div>;
}
