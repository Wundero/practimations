/* eslint-disable @next/next/no-img-element */
import { cn } from "~/utils/cn";

export function UserAvatar({
  user,
  presence,
}: {
  user: {
    name?: string | null;
    image?: string | null;
  };
  presence?: boolean;
}) {
  if (!user.image) {
    return (
      <div
        className={cn("avatar placeholder", {
          online: presence,
          offline: presence === false,
        })}
      >
        <div className="w-8 rounded-full bg-base-300 text-base-content">
          <span className="text-sm">{user.name?.[0] ?? "?"}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("avatar", {
        online: presence,
        offline: presence === false,
      })}
    >
      <div className="w-8 rounded-full">
        <img src={user.image} alt={user.name ?? "Unknown User"} />
      </div>
    </div>
  );
}
