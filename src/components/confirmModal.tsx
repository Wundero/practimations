import { HtmlDialog } from "./htmlDialog";

type ConfirmModalProps = {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
};

export default function ConfirmModal({
  onConfirm,
  loading,
  ...props
}: ConfirmModalProps) {
  return (
    <HtmlDialog {...props}>
      <div className="modal-box max-w-3xl">
        {props.children}
        <div className="modal-action">
          <button className="btn" onClick={props.onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-error"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="loading loading-spinner"></div>
                Loading...
              </>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
