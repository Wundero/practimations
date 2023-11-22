import type { Ticket, Result, Vote } from "@prisma/client";
import { Decimal } from "decimal.js";

type Tx = Ticket & {
  results: {
    [K in keyof Result]: Result[K] extends Decimal ? Decimal | string : Result[K];
  }[];
  votes: { [K in keyof Vote]: Vote[K] }[];
};

export type CalculateValue = (ticket: Tx) => Decimal;

export const averageResults: CalculateValue = (ticket) => {
  if (ticket.overrideValue !== null) {
    return new Decimal(ticket.overrideValue);
  }
  const { results } = ticket;
  if (!results.length) {
    return new Decimal(0);
  }
  const total = results.reduce<Decimal>((acc, result) => acc.add(result.value), new Decimal(0));
  return total.div(results.length);
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
      const categoryResults = votes.reduce<Decimal>((acc, vote) => acc.add(vote.value), new Decimal(0));
      acc[category] = categoryResults.div(votes.length);
      return acc;
    },
    {} as Record<number, Decimal>,
  );
};

export const averageVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return new Decimal(0);
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce((acc, value) => acc.add(value), new Decimal(0));
  return total.div(Object.keys(avgAcross).length);
};

export const geometricAverageResults: CalculateValue = (ticket) => {
  if (ticket.overrideValue !== null) {
    return new Decimal(ticket.overrideValue);
  }
  const { results } = ticket;
  if (!results.length) {
    return new Decimal(0);
  }
  const total = results.reduce((acc, result) => acc.mul(result.value), new Decimal(1));
  const exp = new Decimal(1).div(results.length);
  return total.pow(exp);
};

export const geometricAverageVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return new Decimal(0);
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce((acc, vote) => acc.mul(vote), new Decimal(1));
  const exp = new Decimal(1).div(Object.keys(avgAcross).length);
  return total.pow(exp);
};

export const squareResults: CalculateValue = (ticket) => {
  if (ticket.overrideValue !== null) {
    return new Decimal(ticket.overrideValue);
  }
  const { results } = ticket;
  if (!results.length) {
    return new Decimal(0);
  }
  const total = results.reduce(
    (acc, result) => acc.add(new Decimal(result.value).mul(result.value)),
    new Decimal(0),
  );

  return total.div(results.length * results.length);
};

export const squareVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return new Decimal(0);
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce(
    (acc, vote) => acc.add(vote.mul(vote)),
    new Decimal(0),
  );
  const ln = Object.keys(avgAcross).length;
  return total.div(ln * ln);
};

const NONLINEAR_K = 3;

export const nonlinearResults: CalculateValue = (ticket) => {
  if (ticket.overrideValue !== null) {
    return new Decimal(ticket.overrideValue);
  }
  const { results } = ticket;
  if (!results.length) {
    return new Decimal(0);
  }
  const total = results.reduce(
    (acc, result) => acc.add(new Decimal(result.value).pow(NONLINEAR_K)),
    new Decimal(0),
  );
  return total.div(results.length).pow(new Decimal(1).div(NONLINEAR_K));
};

export const nonlinearVotes: CalculateValue = (ticket) => {
  const { votes } = ticket;
  if (!votes.length) {
    return new Decimal(0);
  }
  const avgAcross = averageAcrossCategories(ticket);
  const total = Object.values(avgAcross).reduce(
    (acc, vote) => acc.add(vote.pow(NONLINEAR_K)),
    new Decimal(0),
  );
  const exp = new Decimal(1).div(NONLINEAR_K);
  return total.div(Object.keys(avgAcross).length).pow(exp);
};

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
  },
} as const;

export default algorithms;
