import { useEffect, useRef } from "react";

type DialogProps = {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
};

export const HtmlDialog = (props: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!ref.current || ref.current.open === props.open) {
      return;
    }
    if (props.open) {
      ref.current.showModal();
    } else {
      ref.current.close();
    }
  }, [props.open, ref]);

  useEffect(() => {
    if (ref.current) {
      const cur = ref.current;
      cur.addEventListener("close", props.onClose);
      return () => {
        cur.removeEventListener("close", props.onClose);
      };
    }
  }, [ref, props.onClose]);

  return (
    <dialog className="modal" ref={ref}>
      {props.children}
      <form method="dialog" className="modal-backdrop">
        <button className="cursor-default">close</button>
      </form>
    </dialog>
  );
};
