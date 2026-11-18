import type { InputHTMLAttributes } from "react";

/** The app's slider: a slim filled track and a round thumb (styles: `.fold-range` in globals.css). Use it for every range input. */
export function RangeSlider({ className = "", style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const value = Number(props.value ?? props.defaultValue ?? min);
  const p = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return <input type="range" {...props} className={`fold-range ${className}`.trim()} style={{ ...style, "--p": `${p}%` } as React.CSSProperties} />;
}
