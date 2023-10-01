import type { GetServerSideProps } from "next";
import { getProviders, signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { FaAtlassian, FaGithub, FaGitlab } from "react-icons/fa";
import { getServerAuthSession } from "~/server/auth";
import { LinearIcon, NotionIcon } from "~/components/icons";
import Link from "next/link";
import { MdHome } from "react-icons/md";
import { UserAvatar } from "~/components/userAvatar";
import { cn } from "~/utils/cn";
import DeleteConfirmModal from "~/components/deleteConfirmModal";
import { api } from "~/utils/api";
import { useRouter } from "next/router";
import ConfirmModal from "~/components/confirmModal";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerAuthSession(ctx);

  if (!session) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      session,
    },
  };
};

export default function SettingsPage() {
  const router = useRouter();

  const session = useSession();
  const [providers, setProviders] = useState<
    | {
        id: string;
        name: string;
      }[]
    | null
  >(null);

  const deleteAccountMutation = api.main.deleteAccount.useMutation();
  const unlinkAccountMutation = api.main.unlinkAccount.useMutation();

  useEffect(() => {
    getProviders()
      .then((providers) => {
        if (providers) {
          setProviders(Object.values(providers));
        }
      })
      .catch(console.error);
  }, []);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState<{
    id: string;
    name: string;
  } | null>(null);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8">
      <div className="absolute left-0 top-0 p-4">
        <Link href="/">
          <button className="btn btn-circle">
            <MdHome size={24} />
          </button>
        </Link>
      </div>
      <div className="absolute top-0 p-8">
        <h1 className="text-center text-3xl font-bold">Settings</h1>
      </div>
      <div className="flex flex-col gap-3 rounded-md border border-accent p-4">
        <h2 className="text-center text-xl font-semibold">Accounts</h2>
        {(providers ?? [])
          .map((provider) => {
            if (!session.data?.user.accounts) {
              return {
                ...provider,
                linked: undefined,
              };
            }
            const linked = session.data.user.accounts.find((p) => {
              return p.provider === provider.id;
            });
            return {
              ...provider,
              linked,
            };
          })
          .map((provider) => {
            let IconComponent = FaGithub;

            switch (provider.id) {
              case "linear":
                IconComponent = LinearIcon;
                break;
              case "notion":
                IconComponent = NotionIcon;
                break;
              case "gitlab":
                IconComponent = FaGitlab;
                break;
              case "atlassian":
                IconComponent = FaAtlassian;
                break;
              case "github":
              default:
                break;
            }

            return (
              <div key={provider.id} className="flex justify-between gap-3">
                {provider.linked && (
                  <div
                    className="tooltip flex w-fit items-center gap-2 rounded-xl bg-base-300 px-2 py-1 text-base-content"
                    key={provider.id}
                    data-tip={provider.name}
                  >
                    <IconComponent size={28} />
                    <UserAvatar
                      user={{
                        image: provider.linked.accountImage ?? undefined,
                        name: provider.linked.accountName ?? undefined,
                      }}
                    />
                    {provider.linked.accountName}
                  </div>
                )}
                <ConfirmModal
                  open={
                    !!unlinkConfirmOpen && unlinkConfirmOpen.id === provider.id
                  }
                  loading={unlinkAccountMutation.isLoading}
                  onClose={() => {
                    setUnlinkConfirmOpen(null);
                  }}
                  onConfirm={() => {
                    unlinkAccountMutation.mutate(
                      { provider: provider.id },
                      {
                        onSuccess: () => {
                          setUnlinkConfirmOpen(null);
                          router.reload();
                        },
                        onError: (e) => {
                          console.error(e);
                        },
                      },
                    );
                  }}
                >
                  <span>
                    Are you sure you want to unlink your{" "}
                    <span className="font-bold">{provider.name}</span> account?
                  </span>
                </ConfirmModal>
                <button
                  disabled={
                    provider.linked && session.data?.user.accounts.length === 1
                  }
                  onClick={() => {
                    if (!provider.linked) {
                      signIn(provider.id).catch((e) => {
                        console.error(e);
                      });
                    } else {
                      setUnlinkConfirmOpen(provider);
                    }
                  }}
                  className={cn("btn btn-primary btn-outline", {
                    "w-full": !provider.linked,
                    "btn-error": !!provider.linked,
                  })}
                >
                  {!provider.linked && <IconComponent size={24} />}
                  {provider.linked
                    ? "Unlink"
                    : `Link your ${provider.name} account`}
                </button>
              </div>
            );
          })}
        <div className="flex flex-col gap-3 rounded-md border border-error p-4">
          <span className="text-center text-lg font-semibold text-error">
            Danger Zone
          </span>
          <button
            className="btn btn-error"
            onClick={() => {
              setDeleteConfirmOpen(true);
            }}
          >
            Delete my account
          </button>
          <DeleteConfirmModal
            open={deleteConfirmOpen}
            loading={deleteConfirmLoading}
            onClose={() => {
              setDeleteConfirmOpen(false);
            }}
            onConfirm={() => {
              setDeleteConfirmLoading(true);
              deleteAccountMutation.mutate(undefined, {
                onSuccess: () => {
                  setDeleteConfirmLoading(false);
                  setDeleteConfirmOpen(false);
                  router.push("/").catch(console.error);
                },
                onError: (e) => {
                  console.error(e);
                  setDeleteConfirmLoading(false);
                },
              });
            }}
            confirmationInput={
              session.data?.user.name ?? session.data?.user.email ?? "DELETEME"
            }
          >
            <div className="flex w-full flex-col gap-3 pb-1">
              <span className="text-3xl">Confirm</span>
              <span className="text-center">
                Are you sure you want to delete your account?
              </span>
            </div>
          </DeleteConfirmModal>
        </div>
      </div>
    </div>
  );
}
