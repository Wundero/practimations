import type { Ticket, Result, Vote } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

type Tx = Ticket & {
  results: {
    [K in keyof Result]: Result[K] extends Decimal ? number : Result[K];
  }[];
  votes: { [K in keyof Vote]: Vote[K] }[];
};

export type CalculateValue = (ticket: Tx) => number;

export const averageResults: CalculateValue = (ticket) => {
  const { results } = ticket;
  if (!results.length) {
    return 0;
  }
  const total = results.reduce((acc, result) => acc + result.value, 0);
  return total / results.length;
};

const averageAcrossCategories = (ticket: Tx) => {
  const categories = ticket.votes.reduce((acc, vote) => {
    if (!acc.includes(vote.categoryId)) {
      return [...acc, vote.categoryId];
    }
    return acc;
  }, [] as number[]);
  return categories.reduce(
    (acc, category) => {
      const votes = ticket.votes.filter((vote) => vote.categoryId === category);
      const categoryResults = votes.reduce((acc, vote) => acc + vote.value, 0);
      acc[category] = categoryResults / votes.length;
      return acc;
    },
    {} as Record<number, number>,
  );
};

export const averageVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return 0;
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce((acc, value) => acc + value, 0);
  return total / Object.keys(avgAcross).length;
};

export const geometricAverageResults: CalculateValue = (ticket) => {
  const { results } = ticket;
  if (!results.length) {
    return 0;
  }
  const total = results.reduce((acc, result) => acc * result.value, 1);
  return Math.pow(total, 1 / (results.length - 1));
};

export const geometricAverageVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return 0;
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce((acc, vote) => acc * vote, 1);
  return Math.pow(total, 1 / (Object.keys(avgAcross).length - 1));
};

export const squareResults: CalculateValue = (ticket) => {
  const { results } = ticket;
  if (!results.length) {
    return 0;
  }
  const total = results.reduce(
    (acc, result) => acc + result.value * result.value,
    0,
  );

  return total / (results.length * results.length);
};

export const squareVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return 0;
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce(
    (acc, vote) => acc + vote * vote,
    0,
  );
  return total / Math.pow(Object.keys(avgAcross).length, 2);
};

const NONLINEAR_K = 3;

export const nonlinearResults: CalculateValue = (ticket) => {
  const {results} = ticket;
  if (!results.length) {
    return 0;
  }
  const total = results.reduce((acc, result) => acc + Math.pow(result.value, NONLINEAR_K), 0);
  return Math.pow(total / results.length, 1 / NONLINEAR_K);
}

export const nonlinearVotes: CalculateValue = (ticket) => {
  const {votes} = ticket;
  if (!votes.length) {
    return 0;
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce((acc, vote) => acc + Math.pow(vote, NONLINEAR_K), 0);
  return Math.pow(total / Object.keys(avgAcross).length, 1 / NONLINEAR_K);
}

const algorithms = {
  average: {
    results: averageResults,
    votes: averageVotes,
  },
  // geometric: {
  //   results: geometricAverageResults,
  //   votes: geometricAverageVotes,
  // },
  // square: {
  //   results: squareResults,
  //   votes: squareVotes,
  // },
  nonlinear: {
    results: nonlinearResults,
    votes: nonlinearVotes,
  }
} as const;

export default algorithms;
