import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
}

export function ConfirmDialog(props: {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { onCancel, busy } = props;
  useEscape(() => {
    if (!busy) onCancel();
  });
  return createPortal(
    <div className="overlay overlay-center" onClick={() => !busy && onCancel()}>
      <div
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="alert-body">
          <h2 id="alert-title" className="alert-title">
            {props.title}
          </h2>
          {props.message && <div className="alert-message">{props.message}</div>}
        </div>
        <div className="alert-actions">
          <button type="button" className="alert-btn" onClick={onCancel} disabled={busy}>
            {props.cancelLabel ?? '取消'}
          </button>
          <button
            type="button"
            className={`alert-btn alert-btn-strong${props.destructive ? ' danger' : ''}`}
            onClick={props.onConfirm}
            disabled={busy}
          >
            {busy ? '處理中…' : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface SheetAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function ActionSheet(props: { title?: string; subtitle?: string; actions: SheetAction[]; onClose: () => void }) {
  useEscape(props.onClose);
  return createPortal(
    <div className="overlay overlay-bottom" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-group">
          {(props.title || props.subtitle) && (
            <div className="sheet-header">
              {props.title && <div className="sheet-title">{props.title}</div>}
              {props.subtitle && <div className="sheet-subtitle">{props.subtitle}</div>}
            </div>
          )}
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`sheet-btn${a.destructive ? ' danger' : ''}`}
              disabled={a.disabled}
              onClick={() => {
                props.onClose();
                a.onSelect();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="sheet-group">
          <button type="button" className="sheet-btn sheet-cancel" onClick={props.onClose}>
            取消
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Panel(props: { title: string; children: ReactNode; onClose: () => void; doneLabel?: string }) {
  useEscape(props.onClose);
  return createPortal(
    <div className="overlay overlay-bottom" onClick={props.onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <span className="panel-title">{props.title}</span>
          <button type="button" className="text-btn strong" onClick={props.onClose}>
            {props.doneLabel ?? '完成'}
          </button>
        </div>
        <div className="panel-body">{props.children}</div>
      </div>
    </div>,
    document.body,
  );
}
