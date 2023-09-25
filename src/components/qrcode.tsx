"use client";

import * as qrcode from "@bitjson/qr-code";
import { type QRCodeAnimation } from "@bitjson/qr-code/dist/types/components/qr-code/animations";
import React from "react";

if (typeof window !== "undefined") {
  qrcode.defineCustomElements(window);
}

export type QRCodeProps = {
  contents: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLQrCodeElement>;

export const fadeIn: QRCodeAnimation = (targets, _x, _y, _count, entity) => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  targets,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  from: entity === "module" ? Math.random() * 200 : 200,
  duration: 500,
  easing: "cubic-bezier(.5,0,1,1)",
  web: { opacity: [0, 1], scale: [0.5, 1.1, 1] },
});

export const fadeOut: QRCodeAnimation = (targets, _x, _y, _count, entity) => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  targets,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  from: entity === "module" ? Math.random() * 200 : 200,
  duration: 500,
  easing: "cubic-bezier(.5,0,1,1)",
  web: { opacity: [1, 0], scale: [1, 1.1, 0.5] },
});

export const QRCode = React.forwardRef<HTMLQrCodeElement, QRCodeProps>(
  function QRCode(props, ref) {
    const { contents } = props;

    return (
      <qr-code
        ref={ref}
        contents={contents}
        module-color="hsl(var(--pc))"
        position-center-color="hsl(var(--pc))"
        position-ring-color="hsl(var(--pc))"
      >
        <div slot="icon">{props.children}</div>
      </qr-code>
    );
  },
);
