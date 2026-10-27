import type { ReactNode } from "react";
import { ICONS } from "../brain/icons";

// Os ícones do design: 24×24, traço arredondado.
export function Svg({ size = 15, weight = 1.75, style, children }: { size?: number; weight?: number; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {children}
    </svg>
  );
}

// O desenho de um departamento ou de um tipo de item, no cartão.
export function KindIcon({ name }: { name: string }) {
  return (
    <Svg size={17}>
      <path d={ICONS[name] ?? ICONS.folder}></path>
    </Svg>
  );
}

export const Check = ({ hidden }: { hidden: boolean }) => (
  <Svg size={13} weight={2.2} style={{ flex: "none", visibility: hidden ? "hidden" : "visible" }}>
    <path d="m5 12.5 4.5 4.5L19 7"></path>
  </Svg>
);

export const Close = () => (
  <Svg weight={2}>
    <path d="M18 6 6 18"></path>
    <path d="m6 6 12 12"></path>
  </Svg>
);

export const External = () => (
  <Svg size={14}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"></path>
  </Svg>
);

export const Copy = () => (
  <Svg size={14}>
    <rect x="9" y="9" width="11" height="11" rx="2"></rect>
    <path d="M5 15V6a2 2 0 0 1 2-2h8"></path>
  </Svg>
);
