import { useAutoAnimate } from "@formkit/auto-animate/react";

export function ADiv(props: Omit<React.ComponentProps<"div">, "ref">) {
  const [animationParent] = useAutoAnimate();

  return <div ref={animationParent} {...props} />;
}