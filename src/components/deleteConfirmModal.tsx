import { useEffect, useState } from "react";
import { HtmlDialog } from "./htmlDialog";

type DeleteConfirmModalProps = {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmationInput: string;
};

export default function DeleteConfirmModal({
  onConfirm,
  loading,
  confirmationInput,
  ...props
}: DeleteConfirmModalProps) {
  const [userInput, setUserInput] = useState("");

  useEffect(() => {
    if (props.open) {
      setUserInput("");
    }
  }, [props.open])

  return (
    <HtmlDialog {...props}>
      <div className="modal-box max-w-3xl">
        {props.children}
        <div className="flex items-center flex-col gap-4">
          <span>
            Type <span className="font-bold">&ldquo;{confirmationInput}&rdquo;</span> to confirm
          </span>
          <input
            value={userInput}
            onChange={(e) => {
              setUserInput(e.target.value);
            }}
            className="input input-bordered input-error w-full"
          />
        </div>
        <div className="modal-action">
          <button className="btn" onClick={props.onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-error"
            onClick={onConfirm}
            disabled={userInput !== confirmationInput || loading}
          >
            {loading ? (
              <>
                <div className="loading loading-spinner"></div>
                Deleting...
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
