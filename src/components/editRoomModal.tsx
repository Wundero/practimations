import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useEffect, useMemo, useState } from "react";

export default function EditRoomModal({
  open,
  slug,
  ...props
}: {
  open: boolean;
  slug: string | null;
  onClose: () => void;
}) {
  const editMutation = api.main.editRoom.useMutation();
  const room = api.main.getRoom.useQuery({
    slug: slug ?? "",
  });

  const utils = api.useContext();

  const isOpen = useMemo(() => {
    return open && slug !== null && !!room.data;
  }, [open, slug, room]);

  const [name, setName] = useState(room.data?.name ?? "");
  const [maxMembers, setMaxMembers] = useState(room.data?.maxMembers ?? 100);

  useEffect(() => {
    setName(room.data?.name ?? "");
    setMaxMembers(room.data?.maxMembers ?? 100);
  }, [room.data]);

  return (
    <HtmlDialog {...props} open={isOpen}>
      <div className="modal-box">
        <h3 className="pb-4 text-xl">Edit {room.data?.name}</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Room Name"
          className="input input-bordered w-full"
        />
        <div className="p-2" />
        <div className="pt-4">
          <label className="label">
            <span className="label-text">Max users</span>
            <input
              type="number"
              value={maxMembers}
              min={2}
              max={100}
              onChange={(e) => {
                setMaxMembers(parseInt(e.target.value));
              }}
              placeholder="Min"
              className="input input-bordered w-full"
            />
          </label>
        </div>
        <div className="modal-action">
          <button
            className="btn"
            disabled={editMutation.isLoading || name.length === 0}
            onClick={() => {
              editMutation.mutate(
                {
                  slug: slug!,
                  name,
                  maxMembers: Math.min(100, Math.max(2, maxMembers)),
                },
                {
                  onSuccess: () => {
                    props.onClose();
                  },
                },
              );
              utils.main.getRoom.setData({ slug: slug! }, (old) => {
                if (!old) {
                  return old;
                }
                return {
                  ...old,
                  name,
                  maxMembers: Math.min(100, Math.max(2, maxMembers)),
                };
              });
              utils.main.getMyRooms.setData(undefined, (old) => {
                if (!old) {
                  return old;
                }
                return old.map((room) => {
                  if (room.slug === slug) {
                    return {
                      ...room,
                      name,
                      maxMembers: Math.min(100, Math.max(2, maxMembers)),
                    };
                  }
                  return room;
                });
              });
            }}
          >
            {editMutation.isLoading ? (
              <>
                <span className="loading loading-spinner"></span>Editing...
              </>
            ) : (
              "Edit"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
