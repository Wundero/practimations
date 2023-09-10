import { api } from "~/utils/api";
import { HtmlDialog } from "./htmlDialog";
import { useState } from "react";
import { useRouter } from "next/router";
import { cn } from "~/utils/cn";

export default function JoinRoomModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const joinMutation = api.main.joinRoom.useMutation();

  const router = useRouter();

  const [roomSlug, setRoomSlug] = useState("");
  const [slugHasChanged, setSlugHasChanged] = useState(false);

  return (
    <HtmlDialog {...props}>
      <div className="modal-box">
        <h3 className="pb-4 text-xl">Join A Room</h3>
        <input
          type="text"
          value={roomSlug}
          onChange={(e) => {
            setRoomSlug(e.target.value);
            setSlugHasChanged(true);
          }}
          placeholder="Room Slug"
          className={cn("input input-bordered", {
            "input-error": !!joinMutation.error,
          })}
        />
        {!!joinMutation.error && (
          <span className="text-error">{joinMutation.error.message}</span>
        )}
        <div className="modal-action">
          <button
            className="btn"
            disabled={joinMutation.isLoading || !slugHasChanged || !roomSlug}
            onClick={() => {
              setSlugHasChanged(false);
              joinMutation.mutate(
                { slug: roomSlug },
                {
                  onSuccess(data) {
                    router.push(`/room/${data.slug}`).catch(console.error);
                  },
                },
              );
            }}
          >
            {joinMutation.isLoading ? (
              <>
                <span className="loading loading-spinner"></span>Joining...
              </>
            ) : (
              "Join"
            )}
          </button>
        </div>
      </div>
    </HtmlDialog>
  );
}
