import type { GetServerSideProps } from "next";
import { signIn, useSession } from "next-auth/react";
import { getServerAuthSession } from "~/server/auth";
import { FaGithub } from "react-icons/fa";
import { useMemo, useState } from "react";
import CreateRoomModal from "~/components/createRoomModal";
import { api } from "~/utils/api";
import Link from "next/link";
import { MdClose } from "react-icons/md";
import ConfirmModal from "~/components/confirmModal";
import { useRouter } from "next/router";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession(ctx);
  return {
    props: {
      session,
    },
  };
};

function RoomInput() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    slug: string;
    name: string;
  } | null>(null);

  const myRooms = api.main.getMyRooms.useQuery();

  const utils = api.useContext();

  const deleteRoomMutation = api.main.deleteRoom.useMutation();

  return (
    <>
      <div className="flex gap-4">
        <button className="btn" onClick={() => setCreateDialogOpen(true)}>
          Create a room
        </button>
        <CreateRoomModal
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
        />
      </div>
      <ConfirmModal
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        loading={deleteRoomMutation.isLoading}
        onConfirm={() => {
          utils.main.getMyRooms.setData(undefined, (prev) => {
            if (!prev) {
              return prev;
            }
            return prev.filter((room) => room.slug !== confirmDialog!.slug);
          });
          deleteRoomMutation.mutate(
            { slug: confirmDialog!.slug },
            {
              onSuccess() {
                setConfirmDialog(null);
                utils.main.getMyRooms.invalidate().catch(console.error);
              },
            },
          );
        }}
      >
        Are you sure you want to delete{" "}
        <span className="font-bold">{confirmDialog?.name}</span>?
      </ConfirmModal>
      <div className="flex flex-col gap-2 text-white">
        <span className="text-xl">My Rooms:</span>
        {myRooms.status === "loading" ? (
          <div>Loading...</div>
        ) : myRooms.data?.length === 0 ? (
          <div>No rooms yet</div>
        ) : (
          myRooms.data?.map((room) => (
            <div className="flex items-center gap-2" key={room.slug}>
              <Link href={`/join/${room.slug}`} className="link">
                {room.name}
              </Link>
              <button
                className="btn btn-circle btn-ghost btn-xs"
                onClick={() => {
                  setConfirmDialog({
                    slug: room.slug,
                    name: room.name,
                  });
                }}
              >
                <MdClose />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function Unauthenticated() {
  const router = useRouter();

  const callbackUrl = useMemo(() => {
    if (typeof router.query.cb === "string") {
      return `/join/${router.query.cb}`;
    }
    return undefined;
  }, [router]);

  return (
    <button
      onClick={() => {
        if (callbackUrl) {
          signIn("github", { callbackUrl }).catch(console.error);
          return;
        }
        signIn("github").catch((e) => {
          console.error(e);
        });
      }}
      className="btn btn-primary btn-outline"
    >
      <FaGithub size={24} />
      Sign in with GitHub
    </button>
  );
}

export default function Home() {
  const session = useSession();

  return (
    <>
      <main className=" flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
            <span className="text-[hsl(280,100%,70%)]">Practimations</span>
          </h1>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-[3rem]">
            <span>Estimates for the </span>
            <span className="text-[hsl(280,100%,70%)]">soul</span>
          </h2>
          <h3>
            <Link
              className="flex items-center gap-2"
              target="_blank"
              href="https://github.com/Wundero/practimations"
            >
              Check out the project on <FaGithub />
              <span className="link">GitHub</span>
            </Link>
          </h3>
          <div className="flex flex-col items-center gap-2">
            {session.status === "loading" ? (
              <span className="loading loading-dots text-primary"></span>
            ) : session.status === "unauthenticated" ? (
              <Unauthenticated />
            ) : (
              <RoomInput />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
