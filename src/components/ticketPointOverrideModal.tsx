import type { RouterOutputs } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useState } from "react";
import { cn } from "~/utils/cn";
import Decimal from "decimal.js";

export default function TicketPointOverrideModal(props: {
  open: boolean;
  room: RouterOutputs["main"]["getRoom"];
  onClose: () => void;
  onComplete: (value: number) => void;
}) {
  const { room } = props;

  const [value, setValue] = useState<number | null>(null);

  if (!room) {
    return null;
  }
  return (
    <HtmlDialog {...props}>
      <div className="modal-box max-w-3xl">
        <h3 className="pb-4 text-center text-xl">Add Tickets</h3>
        <div className="my-2 flex justify-center gap-2">
          {room.valueRange ? (
            <div className="flex items-center gap-2">
              <input
                value={(() => {
                  const out =
                    value ??
                    new Decimal(
                      room.values.find((v) => v.display === "min")!.value,
                    ).toNumber();
                  if (out < 0) {
                    return "";
                  } else {
                    return out;
                  }
                })()}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (isNaN(value)) {
                    return;
                  }
                  setValue(value);
                }}
                className="input input-bordered text-base-content"
                type="number"
                min={new Decimal(
                  room.values.find((v) => v.display === "min")!.value,
                ).toNumber()}
                max={new Decimal(
                  room.values.find((v) => v.display === "max")!.value,
                ).toNumber()}
              />
            </div>
          ) : (
            <div className="flex max-w-[16rem] flex-wrap gap-2">
              {room.values.map((v) => {
                const vx = new Decimal(v.value);
                const has = vx.eq(value ?? -3);
                return (
                  <button
                    key={v.id}
                    className={cn("btn btn-sm", {
                      "btn-primary": has,
                    })}
                    onClick={() => {
                      setValue(vx.toNumber());
                    }}
                  >
                    {v.display}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-action">
          <button
            className="btn"
            onClick={() => {
              props.onClose();
            }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={value === null}
            onClick={() => {
              if (value !== null) {
                props.onComplete(value);
              }
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
