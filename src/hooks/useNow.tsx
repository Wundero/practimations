import { useEffect, useState } from "react";

export const useNow = (fidelity = 300) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, fidelity);

    return () => {
      clearInterval(interval);
    };
  }, [fidelity]);

  return now;
};
