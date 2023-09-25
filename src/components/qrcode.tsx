"use client";

import React, { useMemo } from "react";

import qrcode from "qrcode-generator";
import { cn } from "~/utils/cn";

type SVGProps = {
  qr: QRCode;
  contents: string;
  squares: boolean;
  positionCenterColor: string;
  positionRingColor: string;
  moduleColor: string;
  maskXToYRatio: number;
  moduleCount: number;
  maskCenter: boolean;
};

function QRPositionDetectionPattern({
  x,
  y,
  margin,
  ringFill,
  centerFill,
  coordinateShift,
}: {
  x: number;
  y: number;
  margin: number;
  ringFill: string;
  centerFill: string;
  coordinateShift: number;
}) {
  return (
    <>
      <path
        fill={ringFill}
        data-column={x - margin}
        data-row={y - margin}
        d={`M${x - coordinateShift} ${
          y - 0.5 - coordinateShift
        }h6s.5 0 .5 .5v6s0 .5-.5 .5h-6s-.5 0-.5-.5v-6s0-.5 .5-.5zm.75 1s-.25 0-.25 .25v4.5s0 .25 .25 .25h4.5s.25 0 .25-.25v-4.5s0-.25 -.25 -.25h-4.5z`}
      />
      <path
        fill={centerFill}
        data-column={x - margin + 2}
        data-row={y - margin + 2}
        d={`M${x + 2 - coordinateShift} ${
          y + 1.5 - coordinateShift
        }h2s.5 0 .5 .5v2s0 .5-.5 .5h-2s-.5 0-.5-.5v-2s0-.5 .5-.5z`}
      />
    </>
  );
}

function QRPositionDetectionPatterns(props: {
  count: number;
  margin: number;
  ringFill: string;
  centerFill: string;
  coordinateShift: number;
}) {
  const { count, margin } = props;

  return (
    <>
      <QRPositionDetectionPattern
        key="top-left"
        {...props}
        x={margin}
        y={margin}
      />
      <QRPositionDetectionPattern
        key="top-right"
        {...props}
        x={count - 7 + margin}
        y={margin}
      />
      <QRPositionDetectionPattern
        key="bottom-left"
        {...props}
        x={margin}
        y={count - 7 + margin}
      />
    </>
  );
}

function QRModulesSVG({
  qr,
  count,
  margin,
  maskCenter,
  maskXToYRatio,
  squares,
  moduleFill,
  coordinateShift,
}: {
  qr: QRCode;
  count: number;
  margin: number;
  maskCenter: boolean;
  maskXToYRatio: number;
  squares: boolean;
  moduleFill: string;
  coordinateShift: number;
}) {
  const items = useMemo(() => {
    const out: {
      squares: boolean;
      positionX: number;
      positionY: number;
      coordinateShift: number;
      moduleFill: string;
      row: number;
      column: number;
    }[] = [];
    for (let column = 0; column < count; column += 1) {
      const positionX = column + margin;
      for (let row = 0; row < count; row += 1) {
        if (
          qr.isDark(column, row) &&
          (squares ||
            (!isPositioningElement(row, column, count) &&
              !isRemovableCenter(
                row,
                column,
                count,
                maskCenter,
                maskXToYRatio,
              )))
        ) {
          const positionY = row + margin;
          out.push({
            squares,
            positionX,
            positionY,
            coordinateShift,
            moduleFill,
            row,
            column,
          });
        }
      }
    }

    return out;
  }, [
    qr,
    count,
    margin,
    maskCenter,
    maskXToYRatio,
    squares,
    moduleFill,
    coordinateShift,
  ]);

  return (
    <>
      {items.map((item, key) => {
        if (item.squares) {
          return (
            <rect
              key={key}
              fill={item.moduleFill}
              x={item.positionX - 0.5 - item.coordinateShift}
              y={item.positionY - 0.5 - item.coordinateShift}
              data-column={item.column}
              data-row={item.row}
              width="1"
              height="1"
            />
          );
        } else {
          return (
            <circle
              key={key}
              fill={item.moduleFill}
              cx={item.positionX - coordinateShift}
              cy={item.positionY - coordinateShift}
              data-column={item.column}
              data-row={item.row}
              r="0.5"
            />
          );
        }
      })}
    </>
  );
}

function isPositioningElement(row: number, column: number, count: number) {
  const elemWidth = 7;
  return row <= elemWidth
    ? column <= elemWidth || column >= count - elemWidth
    : column <= elemWidth
    ? row >= count - elemWidth
    : false;
}

/**
 * For ErrorCorrectionLevel 'H', up to 30% of the code can be corrected. To
 * be safe, we limit damage to 10%.
 */
function isRemovableCenter(
  row: number,
  column: number,
  count: number,
  maskCenter: boolean,
  maskXToYRatio: number,
) {
  if (!maskCenter) return false;
  const center = count / 2;
  const safelyRemovableHalf = Math.floor((count * Math.sqrt(0.1)) / 2);
  const safelyRemovableHalfX = safelyRemovableHalf * maskXToYRatio;
  const safelyRemovableHalfY = safelyRemovableHalf / maskXToYRatio;
  const safelyRemovableStartX = center - safelyRemovableHalfX;
  const safelyRemovableEndX = center + safelyRemovableHalfX;
  const safelyRemovableStartY = center - safelyRemovableHalfY;
  const safelyRemovableEndY = center + safelyRemovableHalfY;

  return (
    row >= safelyRemovableStartY &&
    row <= safelyRemovableEndY &&
    column >= safelyRemovableStartX &&
    column <= safelyRemovableEndX
  );
}

function QRCodeSVG({
  qr,
  squares,
  moduleCount,
  positionCenterColor,
  positionRingColor,
  maskXToYRatio,
  moduleColor,
  maskCenter,
}: SVGProps) {
  const margin = 4;

  const pixelSize = moduleCount + margin * 2;
  const coordinateShift = pixelSize / 2;
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      viewBox={`${0 - coordinateShift} ${
        0 - coordinateShift
      } ${pixelSize} ${pixelSize}`}
      preserveAspectRatio="xMinYMin meet"
    >
      <rect
        width="100%"
        height="100%"
        fill="white"
        fill-opacity="0"
        cx={-coordinateShift}
        cy={-coordinateShift}
      />
      {!squares && (
        <QRPositionDetectionPatterns
          count={moduleCount}
          margin={margin}
          ringFill={positionRingColor}
          centerFill={positionCenterColor}
          coordinateShift={coordinateShift}
        />
      )}
      <QRModulesSVG
        coordinateShift={coordinateShift}
        count={moduleCount}
        margin={margin}
        maskCenter={maskCenter}
        maskXToYRatio={maskXToYRatio}
        squares={squares}
        moduleFill={moduleColor}
        qr={qr}
      />
    </svg>
  );
}

export type QRCodeProps = {
  contents: string;
  squares?: boolean;
  positionCenterColor?: string;
  positionRingColor?: string;
  moduleColor?: string;
  maskXToYRatio?: number;
  children?: React.ReactNode;
};

export const QRCode = ({
  squares = false,
  moduleColor = "#000",
  positionRingColor = "#000",
  positionCenterColor = "#000",
  maskXToYRatio = 1,
  contents,
  children,
}: QRCodeProps) => {
  const { qr, moduleCount } = useMemo(() => {
    const qr = qrcode(
      /* Auto-detect QR Code version to use */ 0,
      /* Highest error correction level */ "H",
    );
    qr.addData(contents);
    qr.make();
    return {
      qr,
      moduleCount: qr.getModuleCount(),
    };
  }, [contents]);

  return (
    <div className="relative">
      <div
        className={cn(
          "absolute flex h-full w-full items-center justify-center",
          {
            "invisible hidden": squares,
          },
        )}
      >
        <div
          style={{ width: `${18 * maskXToYRatio}%` }}
          data-column={moduleCount / 2}
          data-row={moduleCount / 2}
        >
          {children}
        </div>
      </div>
      <QRCodeSVG
        contents={contents}
        squares={squares}
        moduleColor={moduleColor}
        positionRingColor={positionRingColor}
        positionCenterColor={positionCenterColor}
        moduleCount={moduleCount}
        maskXToYRatio={maskXToYRatio}
        maskCenter={true}
        qr={qr}
      />
    </div>
  );
};
