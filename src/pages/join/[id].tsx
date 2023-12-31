import type { GetServerSideProps } from "next";
import { getServerAuthSession } from "~/server/auth";
import { prisma } from "~/server/db";

export const getServerSideProps: GetServerSideProps<
  never,
  { id: string }
> = async (context) => {
  if (!context.params) {
    return {
      redirect: {
        destination: `/`,
        permanent: true,
      },
    };
  }

  const { id } = context.params;

  const session = await getServerAuthSession(context);

  if (!session) {
    return {
      redirect: {
        destination: `/?cb=${id}`,
        permanent: false,
      },
    };
  }

  const room = await prisma.room.findUnique({
    where: {
      slug: id,
    },
    include: {
      users: true,
      tickets: true,
    },
  });

  if (!room) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  if (room.users.some((u) => u.userId === session.user.id)) {
    return {
      redirect: {
        destination: `/room/${room.slug}`,
        permanent: true,
      },
    };
  }

  if (room.users.length === room.maxMembers) {
    return {
      redirect: {
        destination: `/`,
        permanent: false,
      },
    };
  }

  await prisma.user.update({
    where: {
      id: session.user.id,
    },
    data: {
      allRooms: {
        create: {
          roomId: room.id,
          spectator: room.tickets.some(
            (t) => t.done || t.voting || t.rejected || t.selected,
          ),
        },
      },
    },
  });

  return {
    redirect: {
      destination: `/room/${room.slug}`,
      permanent: true,
    },
  };
};

export default function JoinPage() {
  return null;
}
